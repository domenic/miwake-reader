export interface HtmlzContent {
  'index.html': string;
  'metadata.opf': string;
  'style.css': string;
  [key: string]: string | Blob;
}
