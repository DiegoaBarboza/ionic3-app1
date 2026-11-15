import { defineConfig } from 'vitest/config';

// Config separada do vite.config.js pra não carregar o plugin de PWA nos testes.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    // fuso do Brasil: as regras de data (todayLocal, atrasos) dependem dele
    env: { TZ: 'America/Sao_Paulo' }
  }
});
