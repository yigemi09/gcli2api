/**
 * 文件用途：Tailwind CSS 框架的全局配置文件
 * 该文件用于配置暗色模式、扫描内容路径、主题容器、插件等，确保前端样式一致性与可维护性
 */

 /** @type {import('tailwindcss').Config} */
module.exports = {
  // 启用 class 模式的暗色主题切换
  darkMode: ["class"],
  // 指定 Tailwind 扫描的文件路径，确保所有组件和页面样式都能被正确生成
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    // 配置容器居中、内边距和超大屏幕断点
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
  },
  // 引入 tailwindcss-animate 插件，支持动画类
  plugins: [require("tailwindcss-animate")],
}