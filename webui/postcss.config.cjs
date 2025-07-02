/**
 * 文件用途：PostCSS 配置文件（CommonJS 规范）
 * 说明：用于前端构建流程，自动处理 TailwindCSS 和浏览器前缀。
 */
module.exports = {
  // 配置 PostCSS 插件
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}