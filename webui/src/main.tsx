// /gemini-openai-proxy/webui/src/main.tsx
//
// 这是 React 应用的主入口文件。
// 它的主要作用是：
// 1. 导入核心的 React 库和 ReactDOM 库。
// 2. 导入主应用组件 (App)。
// 3. 导入全局 CSS 样式。
// 4. 将主应用组件渲染到 HTML 页面中的一个 DOM 元素上。

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css' // 导入 Tailwind CSS 的样式

// `ReactDOM.createRoot` 是 React 18 引入的新 API，用于创建一个 React 根。
// 它会选取 HTML 中 id 为 'root' 的元素作为挂载点。
// `!` 是 TypeScript 的非空断言操作符，我们在这里是确定 `getElementById` 不会返回 null。
const rootElement = document.getElementById('root')!;

// 使用创建的根来渲染我们的应用。
ReactDOM.createRoot(rootElement).render(
  // `<React.StrictMode>` 是一个用于突出显示应用中潜在问题的工具。
  // 它不会渲染任何可见的 UI，但会为其后代元素触发额外的检查和警告。
  // 这在开发模式下非常有帮助。
  <App />,
)