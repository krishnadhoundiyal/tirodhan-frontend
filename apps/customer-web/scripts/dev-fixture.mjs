import { spawn } from 'node:child_process';
const child = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'],
  {
    stdio: 'inherit',
    env: { ...process.env, VITE_CUSTOMER_FIXTURE: 'true' },
  },
);
child.on('exit', (code) => process.exit(code ?? 1));
