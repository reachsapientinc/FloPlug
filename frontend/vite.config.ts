import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Block accidental imports from the backend functions folder
    }
  },
  optimizeDeps: {
    exclude: ['../functions']
  },
  root: './', // Ensures it looks for HTML files in the frontend root
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    'process.env': {},
    'global': 'window'
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),      // Dashboard
        designer: resolve(__dirname, 'designer.html') // FloPlug Canvas
      },
    },
  },
});