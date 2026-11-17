import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../site/.vitepress/dist/', import.meta.url));
const base = '/obsidian-patch/';
async function files(dir) {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]))).flat();
}
const pages = (await files(root)).filter(file => file.endsWith('.html'));
const contents = new Map(await Promise.all(pages.map(async file => [file, await readFile(file, 'utf8')])));
const failures = [];
let links = 0;
for (const [file, html] of contents) {
  for (const [, attr, value] of html.matchAll(/\b(href|src)="([^"]+)"/g)) {
    if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) continue;
    const url = new URL(value.replaceAll('&amp;', '&'), `https://local.invalid${base}${relative(root, file).replaceAll('\\', '/')}`);
    if (!url.pathname.startsWith(base)) { failures.push(`${relative(root, file)}: outside project base: ${value}`); continue; }
    let target = resolve(root, decodeURIComponent(url.pathname.slice(base.length)));
    if (url.pathname.endsWith('/')) target = join(target, 'index.html');
    else if (!extname(target)) target += '.html';
    links++;
    try { if (!(await stat(target)).isFile()) throw new Error('Not a file'); }
    catch { failures.push(`${relative(root, file)}: missing ${value}`); continue; }
    if (attr === 'href' && url.hash && target.endsWith('.html')) {
      const id = decodeURIComponent(url.hash.slice(1));
      if (id && !(contents.get(target) ?? '').includes(`id="${id}"`)) failures.push(`${relative(root, file)}: missing anchor ${value}`);
    }
  }
}
// README links should work in the repository before the website is published.
const readme = fileURLToPath(new URL('../README.md', import.meta.url));
for (const [, value] of (await readFile(readme, 'utf8')).matchAll(/\]\(([^)]+)\)/g)) {
  if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(value)) continue;
  try { await stat(resolve(dirname(readme), value.split('#')[0])); }
  catch { failures.push(`README.md: missing ${value}`); }
}
if (failures.length) throw new Error(failures.join('\n'));
console.log(`Checked ${pages.length} HTML pages, ${links} local links/assets, and README file links.`);
