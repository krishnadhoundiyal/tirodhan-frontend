import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(
  new URL('./bin/vite.js', import.meta.resolve('vite/package.json')),
);
const child = spawn(
  process.execPath,
  [cli, '--host', '127.0.0.1', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: { ...process.env, VITE_OPERATIONS_PREVIEW: 'true' },
  },
);
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
