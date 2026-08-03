import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative base → build serve được ở root lẫn subpath (GitHub Pages /repo/,
  // Plesk subfolder, container). App không dùng router nên không vướng deep-link.
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5199 },
});
