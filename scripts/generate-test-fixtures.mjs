// Generate the canonical EPUB fixtures used by integration tests.
// Output: tests/integration/fixtures/books/*.epub
//
// Run manually whenever the EPUB shape changes:
//   npm run generate-fixtures
//
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TextReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';

const enc = new TextEncoder();

const outDir = resolve(import.meta.dirname, '..', 'tests/integration/fixtures/books');

await mkdir(outDir, { recursive: true });

await writeOut(
  'valid-japanese.epub',
  await buildEPUB({
    title: 'テスト用の本',
    author: 'テスト 太郎',
    identifier: 'urn:uuid:00000000-0000-4000-8000-000000000001',
    language: 'ja',
    chapters: [
      { title: '第一章', body: 'これはテスト用の第一章の本文です。' },
      { title: '第二章', body: 'これはテスト用の第二章の本文です。' },
      { title: '第三章', body: 'これはテスト用の第三章の本文です。' }
    ]
  })
);

await writeOut(
  'long-test-book.epub',
  await buildEPUB({
    title: 'Long test book',
    author: 'Test Author',
    identifier: 'urn:uuid:00000000-0000-4000-8000-000000000002',
    language: 'en',
    chapters: Array.from({ length: 8 }, (_, i) => ({
      title: `Chapter ${i + 1}`,
      body: Array.from(
        { length: 80 },
        (_, j) =>
          `This is paragraph ${j + 1} in chapter ${i + 1}. It gives the reader enough text for several page turns during integration tests.`
      ).join('\n\n')
    }))
  })
);

await writeOut(
  'plain-text-book.txt',
  enc.encode(`This plain text fixture gives the library another real imported book.

It is intentionally small; the integration tests only need a third user-importable title.
`)
);

// "User renamed a text file to .epub" — fails at zip decoding ("End of central directory not
// found"). The most pathological shape.
await writeOut('not-a-zip.epub', enc.encode('this is not a zip, let alone an epub\n'));

// Valid zip, EPUB-shaped name, but missing META-INF/container.xml — fails inside extractEpub. A
// different rung of the malformed ladder than not-a-zip.
await writeOut('not-an-epub.epub', await buildIncompleteEPUB());

console.log(`Wrote fixtures to ${outDir}`);

async function writeOut(name, bytes) {
  const path = resolve(outDir, name);
  await writeFile(path, bytes);
  console.log(`  ${name}  (${bytes.byteLength} bytes)`);
}

async function buildIncompleteEPUB() {
  const writer = new Uint8ArrayWriter();
  const zip = new ZipWriter(writer);
  await zip.add('mimetype', new TextReader('not/an-epub'), { level: 0 });
  await zip.close();
  return writer.getData();
}

async function buildEPUB({ title, author, identifier, language, chapters }) {
  const writer = new Uint8ArrayWriter();
  const zip = new ZipWriter(writer);

  // EPUB requires the mimetype file to be the first entry, stored uncompressed and without extra
  // metadata.
  await zip.add('mimetype', new TextReader('application/epub+zip'), {
    level: 0,
    extendedTimestamp: false,
    dataDescriptor: false
  });

  await zip.add('META-INF/container.xml', new TextReader(containerXml()));
  await zip.add(
    'OEBPS/content.opf',
    new TextReader(packageOpf({ title, author, identifier, language, chapters }))
  );
  await zip.add('OEBPS/nav.xhtml', new TextReader(navXhtml({ title, chapters })));

  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i];
    await zip.add(
      `OEBPS/chapter${i + 1}.xhtml`,
      new TextReader(chapterXhtml(c.title, c.body, language))
    );
  }

  await zip.close();
  return writer.getData();
}

function containerXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;
}

function packageOpf({ title, author, identifier, language, chapters }) {
  const manifestItems = chapters
    .map(
      (_c, i) =>
        `    <item id="ch${i + 1}" href="chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>`
    )
    .join('\n');
  const spineItems = chapters.map((_c, i) => `    <itemref idref="ch${i + 1}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXml(identifier)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>${escapeXml(language)}</dc:language>
    <meta property="dcterms:modified">2024-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifestItems}
  </manifest>
  <spine>
${spineItems}
  </spine>
</package>
`;
}

function navXhtml({ title, chapters }) {
  const items = chapters
    .map((c, i) => `      <li><a href="chapter${i + 1}.xhtml">${escapeXml(c.title)}</a></li>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${escapeXml(title)}</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
${items}
    </ol>
  </nav>
</body>
</html>
`;
}

function chapterXhtml(title, body, language) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
<head><title>${escapeXml(title)}</title></head>
<body>
  <h1>${escapeXml(title)}</h1>
  <p>${escapeXml(body)}</p>
</body>
</html>
`;
}

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
