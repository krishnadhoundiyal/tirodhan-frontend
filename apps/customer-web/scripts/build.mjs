import { build } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
await build();
await build({
  build: { ssr: 'src/prerender.tsx', outDir: '.ssr', emptyOutDir: true },
});
const { render, routes } = await import('../.ssr/prerender.js');
const template = await readFile('dist/index.html', 'utf8');
const escape = (s) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
for (const path of routes) {
  const { body, title, description, noindex } = render(path);
  const head = `<title>${escape(title)}</title><meta name="description" content="${escape(description)}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:type" content="website"><meta name="robots" content="${noindex ? 'noindex, nofollow' : 'index, follow'}">`;
  const directory = path === '/' ? 'dist' : `dist${path}`;
  await mkdir(directory, { recursive: true });
  await writeFile(
    `${directory}/index.html`,
    template
      .replace('<!--page-head-->', head)
      .replace('<!--page-body-->', body),
  );
}
await writeFile('dist/404.html', await readFile('dist/404/index.html', 'utf8'));
await writeFile(
  'dist/robots.txt',
  'User-agent: *\nDisallow: /account\nDisallow: /policies\n',
);
// Canonical host/sitemap URL is deliberately absent until a public origin is approved.
