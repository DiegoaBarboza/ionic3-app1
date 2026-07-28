import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'logo-zenite.svg'],
      manifest: {
        name: 'Controle Financeiro Zênite',
        short_name: 'Zênite Financeiro',
        description: 'Gestão financeira e de horas de projetos de automação/robótica industrial',
        theme_color: '#10141A',
        background_color: '#10141A',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/logo-zenite.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
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
