import { defineConfig } from 'vite';

export default defineConfig(({ command, mode, isPreview }) => ({
  define: {
    __CUSTOMER_DEV_SERVER__: JSON.stringify(
      command === 'serve' && mode === 'development' && !isPreview,
    ),
  },
  oxc: { jsx: { runtime: 'automatic' } },
  server: { host: '127.0.0.1', port: 5185, strictPort: true },
  preview: { host: '127.0.0.1', port: 5186, strictPort: true },
  build: { sourcemap: false },
}));
