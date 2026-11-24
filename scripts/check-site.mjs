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
async function checkSiteLink(label, attr, value, url) {
  if (!url.pathname.startsWith(base)) { failures.push(`${label}: outside project base: ${value}`); return; }
  let target = resolve(root, decodeURIComponent(url.pathname.slice(base.length)));
  if (url.pathname.endsWith('/')) target = join(target, 'index.html');
  else if (!extname(target)) target += '.html';
  links++;
  try { if (!(await stat(target)).isFile()) throw new Error('Not a file'); }
  catch { failures.push(`${label}: missing ${value}`); return; }
  if (attr === 'href' && url.hash && target.endsWith('.html')) {
    const id = decodeURIComponent(url.hash.slice(1));
    if (id && !(contents.get(target) ?? '').includes(`id="${id}"`)) failures.push(`${label}: missing anchor ${value}`);
  }
}
for (const [file, html] of contents) {
  const article = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? html;
  const images = new Set();
  for (const [, src] of article.matchAll(/<img\b[^>]*?\ssrc="([^"]+)"/g)) {
    if (images.has(src)) failures.push(`${relative(root, file)}: repeated image ${src}`);
    images.add(src);
  }
  for (const [, attr, value] of html.matchAll(/\b(href|src)="([^"]+)"/g)) {
    if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) continue;
    const url = new URL(value.replaceAll('&amp;', '&'), `https://local.invalid${base}${relative(root, file).replaceAll('\\', '/')}`);
    await checkSiteLink(relative(root, file), attr, value, url);
  }
}
// Check both repository links and published guide URLs against this build.
const readme = fileURLToPath(new URL('../README.md', import.meta.url));
const markdown = await readFile(readme, 'utf8');
const readmeLinks = [...markdown.matchAll(/\]\(([^)]+)\)|\bhref="([^"]+)"/g)];
for (const [, markdownUrl, htmlUrl] of readmeLinks) {
  const value = markdownUrl ?? htmlUrl;
  if (value.startsWith(`https://yaroxy.github.io${base}`)) {
    await checkSiteLink('README.md', 'href', value, new URL(value));
    continue;
  }
  if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(value)) continue;
  try { await stat(resolve(dirname(readme), value.split('#')[0])); }
  catch { failures.push(`README.md: missing ${value}`); }
}
if (failures.length) throw new Error(failures.join('\n'));
console.log(`Checked ${pages.length} HTML pages, ${links} site links/assets, and README file links.`);
