import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo-zenite.png'],
      manifest: {
        name: 'Controle Financeiro Zênite',
        short_name: 'Zênite Financeiro',
        description: 'Gestão financeira e de horas de projetos de automação/robótica industrial',
        theme_color: '#10141A',
        background_color: '#10141A',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallbackDenylist: [/^\/supabase\//]
      }
    })
  ],
  server: {
    host: true,
    port: 5173
  }
});
