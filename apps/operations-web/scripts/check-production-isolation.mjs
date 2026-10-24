import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? files(join(dir, entry.name))
          : [join(dir, entry.name)],
      ),
    )
  ).flat();
}
const forbidden = [
  'FIXTURE_SCENARIO_MARKER_OW_P0_01',
  'FIXTURE_ONLY_NEVER_A_REAL_CREDENTIAL',
  'https://fixture.invalid',
  'DEMO-CELL-A',
];
for (const file of await files('dist')) {
  const contents = await readFile(file, 'utf8');
  for (const marker of forbidden)
    if (contents.includes(marker))
      throw new Error(
        `Development fixture leaked into production output: ${file}`,
      );
}
process.stdout.write(
  'Production output contains no fixture module, fixture credentials or fixture API origin.\n',
);
