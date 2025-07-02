# Gemini OpenAI Proxy V2 - 实施计划 (带 Web UI)

## 1. 项目目标 (V2)

在现有 API 代理服务的基础上，增加一个精美的、卡片式的中文 Web UI 控制面板。该 UI 将帮助用户轻松配置端口、测试连接、查看实时运行状态和日志，从而解决端口占用问题并极大地提升产品的整体易用性和专业性。

## 2. 架构设计 (V2)

项目将演变为一个全栈应用，后端 Fastify 服务器不仅提供核心的 API 代理功能，还将托管一个静态的前端应用，并通过专有 API 和 WebSocket 与之通信。

```mermaid
graph TD
    subgraph "用户浏览器"
        A[Web UI (React + Tailwind CSS)]
    end

    subgraph "gemini-openai-proxy (我们的应用)"
        subgraph "Fastify Backend"
            B[API Proxy: /v1/chat/completions]
            C[UI API: /api/status]
            D[Static File Server: /]
            F[UI WebSocket: /ws/logs]
        end
    end

    subgraph "Gemini CLI (本地)"
        E[gemini 命令]
    end

    A -- "1. 加载主页" --> D
    D -- "2. 返回 UI 文件 (HTML/CSS/JS)" --> A
    A -- "3. 请求状态 (HTTP GET)" --> C
    C -- "4. 返回状态JSON" --> A
    A -- "5. 建立 WebSocket 连接" --> F
    F -- "6. 实时推送日志" --> A
    
    B -- "调用" --> E
```

## 3. 详细实施步骤

### 第一步：项目结构调整与依赖添加

1.  **创建 `webui/` 目录:** 在项目根目录下创建此目录，用于存放所有前端源代码。
2.  **更新 `package.json`:**
    *   **后端依赖:**
        *   `fastify-static`: 用于托管前端静态文件。
        *   `@fastify/websocket`: Fastify 的 WebSocket 插件，用于实时通信。
    *   **前端开发依赖 (安装在项目根目录):**
        *   `vite`: 现代化的前端构建工具。
        *   `react`, `react-dom`: 前端视图库。
        *   `@types/react`, `@types/react-dom`: React 的类型定义。
        *   `tailwindcss`, `postcss`, `autoprefixer`: 用于构建精美的 UI。
3.  **更新 `scripts`:**
    *   `"build:ui"`: `vite build --outDir dist-webui`
    *   `"build:server"`: `tsc`
    *   `"build"`: `npm run build:ui && npm run build:server`
    *   `"dev"`: 启动一个可以同时热重载前端和后端的开发环境 (例如使用 `concurrently`)。

### 第二步：后端增强 - 支持 Web UI (`src/server.ts`)

1.  **修改端口:** 默认端口更改为 `3003`。
2.  **服务静态文件:**
    *   引入 `fastify-static`。
    *   配置它指向构建好的前端目录 (`dist-webui`)。
3.  **创建 `/api/status` 端点:**
    *   返回一个 JSON 对象，包含 `{ status: 'running', port: 3003, uptime: '...' }`。
4.  **创建 `/ws/logs` WebSocket:**
    *   引入 `@fastify/websocket`。
    *   创建一个日志广播函数，当后端捕获到新的日志（如 Gemini CLI 的调用、错误等）时，调用此函数将日志消息推送给所有连接的 WebSocket 客户端。

### 第三步：前端 Web UI 实现 (`webui/src/`)

1.  **初始化项目:** 使用 `npm create vite@latest webui -- --template react-ts` 初始化前端项目。
2.  **集成 Tailwind CSS:** 按照 Tailwind CSS 官方文档的指引，将其集成到 Vite 项目中。
3.  **组件化开发:**
    *   **`StatusCard.tsx`:**
        *   在组件加载时 `fetch('/api/status')`。
        *   以卡片形式展示“运行状态”、“监听端口”等信息，并使用绿色/红色等颜色指示灯。
    *   **`ConfigCard.tsx`:**
        *   清晰地展示 API 端点地址 (`http://localhost:3003/v1/chat/completions`)，并提供一键复制功能。
        *   提供一个“连接测试”按钮，点击后向 API 端点发送一个简单的测试请求，并根据结果显示“✅ 连接成功”或“❌ 连接失败”的 toast 通知。
    *   **`LogCard.tsx`:**
        *   创建一个 `useLogs` 自定义钩子，它负责建立到 `/ws/logs` 的 WebSocket 连接。
        *   在卡片中渲染一个可滚动的区域，实时显示从 WebSocket 收到的日志消息。

### 第四步：构建与整合

1.  确保 `vite.config.ts` 的 `build.outDir` 设置为 `../dist-webui`，以便将文件构建到后端可以访问的正确位置。
2.  确保 `npm run build` 脚本能够按顺序正确执行前端和后端的构建。
3.  确保 `npm start` 只需启动最终的、整合了所有功能的后端服务器。

---

这份文档是我们下一阶段开发的蓝图，涵盖了从后端 API 增强到前端 UI 实现的完整流程。