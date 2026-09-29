/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from '@vant/auto-import-resolver'
import { VitePWA } from 'vite-plugin-pwa'

/* ============================================================================
 *  构建配置
 * ----------------------------------------------------------------------------
 *  · base='./'  → 产物使用相对路径，可部署到任意静态托管的任意子目录
 *  · Vant 按需引入 → 只打包用到的组件
 *  · PWA        → 预缓存应用外壳，断网也能打开并记录
 * ========================================================================== */
export default defineConfig({
  base: './',
  plugins: [
    vue(),
    Components({ resolvers: [VantResolver()], dts: 'src/components.d.ts' }),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: '宝宝护理 · 三方协同',
        short_name: '宝宝护理',
        description: '育儿嫂与爸爸妈妈实时协同：护理日志、月龄计划、每日汇报、数据看板',
        lang: 'zh-CN',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FFF8F3',
        theme_color: '#FF7E67',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: 'index.html',
        importScripts: ['sw-ext.js'],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
