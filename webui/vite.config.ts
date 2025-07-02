// 文件用途：Vite 前端开发与生产环境配置，包含 React 插件、路径别名、API 代理等
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/*
  Vite 配置说明：
  1. plugins：集成 React 支持
  2. resolve.alias：配置 @ 为 src 目录，便于模块导入
  3. server.proxy：开发环境下将 /api、/v1、/ws 请求代理到本地 3003 端口，支持 WebSocket
  4. build：生产构建输出到 ../dist-webui，自动清空旧文件
*/

export default defineConfig({
  plugins: [react()],
  // 配置路径别名，支持 @ 代表 src 目录
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // 开发服务器代理配置，解决前后端跨域与 WebSocket 问题
  server: {
    proxy: {
      // 代理 /api 请求到后端服务
      '/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
      // 代理 /v1 请求到后端服务
      '/v1': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
      // 代理 /ws WebSocket 请求到后端服务
      '/ws': {
        target: 'ws://localhost:3003',
        ws: true,
      },
    },
  },
  // 构建输出配置，确保产物路径正确
  build: {
    outDir: '../dist-webui',
    emptyOutDir: true,
  },
})