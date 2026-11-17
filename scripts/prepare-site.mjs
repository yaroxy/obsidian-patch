import { copyFile, mkdir } from 'node:fs/promises';
// Keep downloadable examples in one source location; Pages needs public copies.
const destination = new URL('../site/public/examples/', import.meta.url);
await mkdir(destination, { recursive: true });
await copyFile(new URL('../docs/examples/library-search-study.pdf', import.meta.url), new URL('library-search-study.pdf', destination));
await copyFile(new URL('../docs/images/kyoto-cover.jpg', import.meta.url), new URL('kyoto-cover.jpg', destination));
