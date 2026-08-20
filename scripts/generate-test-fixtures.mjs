// Generate the canonical EPUB fixtures used by integration tests.
// Output: tests/integration/fixtures/books/*.epub
//
// Run manually whenever the EPUB shape changes:
//   npm run generate-fixtures
//
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TextReader, Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';
import { coverBitmapBytes } from '../tests/integration/fixtures/cover-bitmap.ts';

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
  'cover-refresh-book.epub',
  await buildEPUB({
    title: 'Cover refresh book',
    author: 'Test Author',
    identifier: 'urn:uuid:00000000-0000-4000-8000-000000000003',
    language: 'en',
    coverColor: { red: 255, green: 0, blue: 0 },
    chapters: [{ title: 'Chapter 1', body: 'This book has a deterministic cover image.' }]
  })
);

await writeOut(
  'spoiler-image-gallery-book.epub',
  await buildEPUB({
    title: 'Spoiler image gallery book',
    author: 'Test Author',
    identifier: 'urn:uuid:00000000-0000-4000-8000-000000000004',
    language: 'en',
    images: {
      'images/cover-before-toc.bmp': bitmapBytes({ red: 45, green: 95, blue: 210 }),
      'images/svg-before-toc.bmp': bitmapBytes({ red: 155, green: 85, blue: 200 }),
      'images/inline-marker.bmp': bitmapBytes({ red: 65, green: 165, blue: 80 }),
      'images/spoiler-illustration-one.bmp': bitmapBytes({ red: 230, green: 80, blue: 70 }),
      'images/spoiler-illustration-two.bmp': bitmapBytes({ red: 240, green: 190, blue: 55 })
    },
    chapters: [
      {
        title: 'Cover',
        bodyHTML: `
  <figure>
    <img src="images/cover-before-toc.bmp" alt="Cover before spoilers" />
  </figure>
  <figure>
    <svg role="img" aria-label="SVG before spoilers" viewBox="0 0 16 16">
      <image href="images/svg-before-toc.bmp" width="16" height="16" />
    </svg>
  </figure>`
      },
      {
        title: 'Table of Contents',
        bodyHTML: `
  <nav>
    <ol>
      <li><a href="chapter3.xhtml">Chapter with images</a></li>
      <li><a href="chapter3.xhtml#second-spoiler">Second spoiler image</a></li>
      <li><a href="chapter3.xhtml#ruby-sample">Ruby sample</a></li>
    </ol>
  </nav>`
      },
      {
        title: 'Chapter with images',
        bodyHTML: `
  <p>
    This chapter has an inline marker
    <img src="images/inline-marker.bmp" alt="Inline marker" />
    that should not appear in the gallery.
  </p>
  <span class="placeholder-br">Legacy placeholder should be removed.</span>
  <figure>
    <img src="images/spoiler-illustration-one.bmp" alt="Spoiler illustration one" />
  </figure>
  <figure>
    <img src="images/spoiler-illustration-one.bmp" alt="Spoiler illustration one duplicate" />
  </figure>
  <p id="second-spoiler">The second illustration should start hidden too.</p>
  <figure>
    <img src="images/spoiler-illustration-two.bmp" alt="Spoiler illustration two" />
  </figure>
  <div style="height: 180vh"></div>
  <p id="ruby-sample">
    This paragraph has <ruby>漢<rt>かん</rt></ruby> with furigana.
  </p>`
      }
    ]
  })
);

await writeOut(
  'media-sizing-book.epub',
  await buildEPUB({
    title: 'Media sizing book',
    author: 'Test Author',
    identifier: 'urn:uuid:00000000-0000-4000-8000-000000000005',
    language: 'en',
    images: {
      'images/portrait-illustration.bmp': bitmapBytes({ red: 45, green: 95, blue: 210 }, 87, 128),
      'images/landscape-illustration.bmp': bitmapBytes({ red: 210, green: 95, blue: 45 }, 128, 87),
      'images/inline-glyph.bmp': bitmapBytes({ red: 65, green: 165, blue: 80 }, 16, 16)
    },
    chapters: [
      {
        title: 'Oversized media',
        bodyHTML: `
  <p>
    This chapter exercises oversized media and an inline glyph
    <img src="images/inline-glyph.bmp" alt="Inline glyph" style="width: 1em; height: 1em" />.
  </p>
  <figure>
    <img
      src="images/portrait-illustration.bmp"
      alt="Oversized portrait illustration"
      style="width: 43.5em; height: 64em"
    />
  </figure>
  <p style="padding: 1em; margin: 1em">
    <img
      src="images/portrait-illustration.bmp"
      alt="Small padded illustration"
      style="width: 2em; height: 2em"
    />
  </p>`
      },
      {
        title: 'Padded illustration',
        bodyHTML: `
  <p style="padding-top: 5em; text-indent: -5em; margin: 1em 0.9375em">
    &#x3000;&#x3000;&#x3000;&#x3000;&#x3000;&#x3000;<img
      src="images/portrait-illustration.bmp"
      alt="Padded portrait illustration"
      style="width: 21.6875em; height: 45em"
    />
  </p>
  <p id="following-text">Following text must not be covered by the illustration.</p>`
      },
      {
        title: 'Padded SVG illustration',
        bodyHTML: `
  <p style="padding-top: 5em; text-indent: -5em; margin: 1em 0.9375em">
    &#x3000;&#x3000;&#x3000;&#x3000;&#x3000;&#x3000;<svg
      role="img"
      aria-label="Padded SVG illustration"
      viewBox="0 0 87 128"
      style="width: 21.6875em; height: 45em"
    >
      <rect width="87" height="128" fill="#2d5fd2" />
    </svg>
  </p>
  <p id="following-svg-text">Following text must not be covered by the SVG illustration.</p>`
      },
      {
        title: 'Nested fixed-layout illustration',
        includeHeading: false,
        bodyHTML: `
  <div>
    <span style="writing-mode: horizontal-tb; vertical-align: middle; width: 100%"></span>
    <div style="display: inline-block; height: 100%; vertical-align: middle">
      <div style="display: block; break-inside: avoid">
        <img
          src="images/landscape-illustration.bmp"
          alt="Nested fixed-layout illustration"
          style="width: 120em; height: 94.8125em"
        />
      </div>
    </div>
  </div>`
      }
    ]
  })
);

await writeOut(
  'edition-title-book.epub',
  await buildEPUB({
    title: '52ヘルツのクジラたち【特典付き】 (中公文庫)',
    author: '町田そのこ',
    identifier: 'urn:uuid:00000000-0000-4000-8000-000000000006',
    language: 'ja',
    chapters: [{ title: '第一章', body: 'この本は書名表示のテスト用です。' }]
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

async function buildEPUB({ title, author, identifier, language, chapters, coverColor, images }) {
  const writer = new Uint8ArrayWriter();
  const zip = new ZipWriter(writer);

  // EPUB requires the mimetype file to be the first entry, stored uncompressed and without extra
  // metadata.
  await zip.add('mimetype', new TextReader('application/epub+zip'), {
    level: 0,
    extendedTimestamp: false,
    dataDescriptor: false
  });

  await zip.add('META-INF/container.xml', new TextReader(containerXML()));
  await zip.add(
    'OEBPS/content.opf',
    new TextReader(
      packageOPF({ title, author, identifier, language, chapters, coverColor, images })
    )
  );
  await zip.add('OEBPS/nav.xhtml', new TextReader(navXHTML({ title, chapters })));
  if (coverColor) {
    await zip.add('OEBPS/cover.bmp', new Uint8ArrayReader(coverBitmapBytes(coverColor)));
  }
  for (const [href, bytes] of Object.entries(images ?? {})) {
    await zip.add(`OEBPS/${href}`, new Uint8ArrayReader(bytes));
  }

  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i];
    await zip.add(`OEBPS/chapter${i + 1}.xhtml`, new TextReader(chapterXHTML(c, language)));
  }

  await zip.close();
  return writer.getData();
}

function containerXML() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;
}

function packageOPF({ title, author, identifier, language, chapters, coverColor, images }) {
  const manifestItems = chapters
    .map(
      (_c, i) =>
        `    <item id="ch${i + 1}" href="chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>`
    )
    .join('\n');
  const coverItem = coverColor
    ? '\n    <item id="cover" href="cover.bmp" media-type="image/bmp" properties="cover-image"/>'
    : '';
  const imageItems = Object.keys(images ?? {})
    .map(
      (href, i) => `    <item id="image${i + 1}" href="${escapeXML(href)}" media-type="image/bmp"/>`
    )
    .join('\n');
  const spineItems = chapters.map((_c, i) => `    <itemref idref="ch${i + 1}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXML(identifier)}</dc:identifier>
    <dc:title>${escapeXML(title)}</dc:title>
    <dc:creator>${escapeXML(author)}</dc:creator>
    <dc:language>${escapeXML(language)}</dc:language>
    <meta property="dcterms:modified">2024-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifestItems}${coverItem}${imageItems ? `\n${imageItems}` : ''}
  </manifest>
  <spine>
${spineItems}
  </spine>
</package>
`;
}

function navXHTML({ title, chapters }) {
  const items = chapters
    .map((c, i) => `      <li><a href="chapter${i + 1}.xhtml">${escapeXML(c.title)}</a></li>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${escapeXML(title)}</title></head>
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

function chapterXHTML(chapter, language) {
  const bodyContent = chapter.bodyHTML ?? `  <p>${escapeXML(chapter.body)}</p>`;
  const heading =
    chapter.includeHeading === false ? '' : `  <h1>${escapeXML(chapter.title)}</h1>\n`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXML(language)}" lang="${escapeXML(language)}">
<head><title>${escapeXML(chapter.title)}</title></head>
<body>
${heading}${bodyContent}
</body>
</html>
`;
}

function bitmapBytes({ red, green, blue }, width = 96, height = 96) {
  const bytesPerPixel = 3;
  const rowSize = Math.ceil((width * bytesPerPixel) / 4) * 4;
  const pixelBytes = rowSize * height;
  const fileBytes = 54 + pixelBytes;
  const bytes = new Uint8Array(fileBytes);
  const view = new DataView(bytes.buffer);

  bytes[0] = 0x42;
  bytes[1] = 0x4d;
  view.setUint32(2, fileBytes, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelBytes, true);

  for (let y = 0; y < height; y += 1) {
    const rowOffset = 54 + y * rowSize;

    for (let x = 0; x < width; x += 1) {
      const offset = rowOffset + x * bytesPerPixel;
      bytes[offset] = blue;
      bytes[offset + 1] = green;
      bytes[offset + 2] = red;
    }
  }

  return bytes;
}

function escapeXML(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
