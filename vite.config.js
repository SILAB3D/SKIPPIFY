import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { existsSync, readFileSync } from 'fs'

const apkVersionFile = resolve(__dirname, '.apk-version-v1.txt')
const persistedApkVersion = existsSync(apkVersionFile)
  ? readFileSync(apkVersionFile, 'utf8').trim()
  : ''
const appVersion = process.env.SKIPPIFY_APP_VERSION || (persistedApkVersion ? `v1.${persistedApkVersion}` : 'v1.0')

export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_BUILD_ID__: JSON.stringify(new Date().toISOString()),
    __APP_VERSION__: JSON.stringify(appVersion)
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
})
