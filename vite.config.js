import { defineConfig } from 'vite';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg'],
            manifest: {
                name: 'Students Performance Analysis Dashboard',
                short_name: 'ResAnalyst',
                description: 'শিক্ষার্থীদের পারফর্ম্যান্স বিশ্লেষণ ড্যাশবোর্ড',
                theme_color: '#2563eb',
                icons: [
                    {
                        src: 'favicon.svg',
                        sizes: '192x192',
                        type: 'image/svg+xml'
                    },
                    {
                        src: 'favicon.svg',
                        sizes: '512x512',
                        type: 'image/svg+xml'
                    }
                ],
                start_url: './',
                display: 'standalone',
                background_color: '#ffffff'
            }
        })
    ],
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
