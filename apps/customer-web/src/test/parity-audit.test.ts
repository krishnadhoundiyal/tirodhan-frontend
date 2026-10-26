import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
test('every current Mobile source/test and route has the reviewed parity snapshot', () => {
  const root = resolve('../customer-mobile');
  const audit = JSON.parse(
    readFileSync('parity-source-audit.json', 'utf8'),
  ) as { routes: Record<string, string>; files: Record<string, string> };
  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)],
    );
  }
  const paths = [
    ...walk(resolve(root, 'src')),
    ...walk(resolve(root, 'app')),
  ].filter((p) => /\.(ts|tsx)$/.test(p));
  const current = Object.fromEntries(
    paths.map((p) => [
      relative(root, p).replaceAll('\\', '/'),
      createHash('sha256')
        .update(readFileSync(p, 'utf8').replaceAll('\r\n', '\n'))
        .digest('hex'),
    ]),
  );
  expect(current).toEqual(audit.files);
  expect(
    Object.keys(current)
      .filter((p) => p.startsWith('app/'))
      .sort(),
  ).toEqual(Object.keys(audit.routes).sort());
  expect(Object.values(audit.routes).every((v) => v.trim().length > 0)).toBe(
    true,
  );
});
