import { defineConfig } from 'vitest/config'

const blitzProxy = {
  '/blitz-ws': {
    target: 'wss://ws1.blitzortung.org',
    ws: true,
    changeOrigin: true,
    rewrite: () => '/',
  },
}

export default defineConfig({
  base: './',
  test: {
    include: ['test/**/*.test.ts'],
  },
  server: {
    port: 5173,
    open: process.env.WX_ELECTRON ? false : true,
    proxy: blitzProxy,
  },
  preview: {
    port: 5173,
    proxy: blitzProxy,
  },
})
