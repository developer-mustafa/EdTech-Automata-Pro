import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    plugins: [],
    root: './',
    base: './',
    publicDir: 'public',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
            },
        },
    },
    server: {
        port: 5173,
        open: true,
        cors: true,
    },
    preview: {
        port: 4173,
    },
});
