import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'
import { resolve } from 'path'
import { offlineData } from './offline-data-plugin'

export default defineConfig({
  plugins: [
    vue(),
    legacy({ targets: ['defaults', 'not IE 11'], modernPolyfills: true }),
    offlineData(),
  ],
  base: './',
  resolve: {
    alias: {
      './data/loader': resolve(__dirname, 'src/data/loader.offline.ts'),
    },
  },
  server: { port: 5173 },
  build: { outDir: 'dist' },
})
