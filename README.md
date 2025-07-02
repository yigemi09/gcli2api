# Gemini OpenAI Proxy - 开发全过程文档

## 1. 项目功能总览

**Gemini OpenAI Proxy** 是一个功能完备、带有精美 Web UI 控制面板的全栈应用。它作为您本地 Gemini CLI 的一个强大的代理服务，旨在解决以下核心问题：

- **统一 API 接口:** 提供一个与 OpenAI Chat Completions API 完全兼容的接口 (`/v1/chat/completions`)，让任何支持 OpenAI API 的第三方应用（如 LobeChat, NextChat, Vercel AI Playground 等）都能无缝地、无需修改地使用您本地的 Gemini 模型能力。
- **简化认证:** 您只需在本地运行一次 Gemini CLI 并完成 Google 账号的登录认证。本代理服务将自动利用这个已建立的认证，您无需为任何第三方应用单独配置或暴露您的 API 密钥。
- **用户友好的控制面板:** 提供一个直观的 Web UI，用户可以轻松查看服务运行状态、获取 API 配置信息、观察实时日志，并通过内置的聊天功能进行端到端的测试。
- **零配置启动:** 项目完全自包含，不依赖任何全局安装。用户只需遵循标准的 `git clone` -> `npm install` -> `npm start/dev` 流程即可启动，极大降低了使用门槛。

---

## 2. 实现方案与架构

我们最终的实现是一个基于 TypeScript 的全栈 monorepo 式项目，其核心架构如下：

```mermaid
graph TD
    subgraph "用户浏览器/第三方应用"
        A[Web UI (React + Tailwind)]
        B[任何 OpenAI 兼容客户端]
    end

    subgraph "gemini-openai-proxy (我们的应用)"
        subgraph "Fastify 后端 (Node.js)"
            C[API 代理: /v1/chat/completions]
            D[Web UI API: /api/status]
            E[静态文件服务器: /]
            F[实时日志 WebSocket: /ws/logs]
        end
    end

    subgraph "Gemini CLI (本地依赖)"
        G[gemini 命令 (node_modules/.bin/gemini)]
    end

    A -- "加载主页" --> E
    A -- "请求状态" --> D
    A -- "建立日志连接" --> F
    A -- "发送聊天" --> C
    B -- "调用 API" --> C

    C -- "调用" --> G
    F -- "广播日志" --> A
```

- **后端:** 使用轻量级、高性能的 **Fastify** 框架。它不仅负责代理核心的 `/v1/chat/completions` 请求，还通过 `@fastify/static` 托管前端 UI，并通过 `@fastify/websocket` 提供实时日志。
- **前端:** 使用 **Vite** + **React** + **TypeScript** 的现代化技术栈构建。UI 方面，我们集成了 **Shadcn/UI** 和 **Tailwind CSS**，以确保界面的专业性和美观性。
- **核心交互:** 后端通过 Node.js 的 `child_process` 模块调用**项目本地**的 Gemini CLI 可执行文件，并通过 `stdin` 和 `stdout` 与其进行流式通信，实现了与主程序的解耦和稳定性。

---

## 3. 开发历程：从想法到产品的演进

这个项目并非一蹴而就，而是经历了一系列真实而宝贵的迭代和调试过程。

### V1.0 - 核心思想：一个简单的命令行代理

我们最初的目标是创建一个简单的 Node.js 服务，它能接收 API 请求，然后通过子进程调用**全局安装**的 `gemini` 命令。

### V2.0 - 关键转折：拥抱本地依赖与 Web UI

在初版即将完成时，我们遇到了两个关键的挑战：

1.  **全局安装的脆弱性:** 我们意识到，依赖用户全局安装 `gemini` 会带来版本不兼容的风险和糟糕的用户体验。在您的关键反馈下，我们做出了一个决定性的架构调整：**将 `@google/gemini-cli` 作为项目的本地开发依赖**。这使得我们的应用完全自包含、稳定且易于分发。
2.  **易用性的提升:** 为了解决端口占用等环境问题，并提供更友好的交互，我们决定为这个服务添加一个 Web UI 控制面板。

### V2.1 & V2.2 - 功能迭代：UI 美化与聊天测试

进入 V2 阶段后，我们迅速迭代：

1.  **UI 美化:** 为了让产品更专业，我们引入了 **Shadcn/UI** 和 **Tailwind CSS**，并重构了所有前端组件，使其从一个开发者面板升级为了一个精美的产品界面。
2.  **交互式测试:** 我们在 UI 中加入了一个完整的**聊天测试功能**，这成为了验证整个系统是否端到端正常工作的最直观、最可靠的方式。

### V2.3 to V2.5 - 联调与调试：解决真实世界的问题

在项目整合阶段，我们作为一个高效的团队，面对并解决了一系列真实开发中才会遇到的复杂问题：

- **Vite 代理问题:** 我们发现前端（运行于 `5173` 端口）无法访问后端（运行于 `3003` 端口）的 API。通过在 `vite.config.ts` 中**配置 proxy**，我们成功解决了这个问题。
- **Tailwind CSS 配置:** 我们通过日志发现 Tailwind 的 `content` 配置不正确，导致样式无法生成。通过修正路径并最终**将配置文件改为 `.cjs` 格式**，我们解决了 UI 的显示问题。
- **WebSocket 类型错误:** 我们遇到了后端 `server.ts` 中因 TypeScript 类型不匹配导致的编译和运行时错误。通过仔细分析错误日志，我们**修正了对 `@fastify/websocket` 库的使用方式**，最终使实时日志功能稳定运行。
- **长提示导致子进程挂起/超时问题:**
  - **问题描述:** 在处理包含大量上下文或指令的聊天请求时，后端服务会启动 `gemini-cli` 子进程，但该子进程会长时间无响应，最终导致代理服务超时。控制台日志显示 `stderr` 和 `stdout` 流超时，且 `响应文本长度` 为 0。
  - **原因分析:** 经过深入调试，我们发现 `gemini-cli` 在设计上支持通过标准输入（stdin）接收长提示，但当提示作为命令行参数传递时，由于操作系统的命令行参数长度限制，过长的提示会被截断，导致 `gemini-cli` 无法正确解析输入，从而挂起或行为异常。此外，`server.ts` 和 `cli-runner.ts` 中对 `stdout` 流的重复监听也可能导致数据收集不完整。
  - **解决方案:**
    1.  **通过 `stdin` 传递提示:** 修改 `cli-runner.ts`，不再将提示作为命令行参数传递，而是通过 `geminiProcess.stdin.write(prompt)` 将提示写入子进程的标准输入流，并立即调用 `geminiProcess.stdin.end()` 关闭输入流。
    2.  **优化 `stdout` 流处理:**
        *   在 `server.ts` 的 `handleGeminiCliRequest` 函数中，使用 `for await (const chunk of geminiStdoutStream)` 循环来异步、可靠地收集 `gemini-cli` 的标准输出。
        *   从 `cli-runner.ts` 中移除对 `geminiProcess.stdout.on('data')` 的监听，确保 `stdout` 流只由 `server.ts` 中的 `for await...of` 循环处理，避免竞态条件和数据丢失。
    3.  **调整超时时间:** 适当增加了 `stderr` 和 `stdout` 流的超时时间，以适应 `gemini-cli` 处理复杂请求可能需要的时间。

正是这一次次严谨的规划、开发、反馈和调试，才最终成就了今天这个高质量的、功能完备的项目。

---

## 4. 最终运行指南

1.  **进入项目目录:**
    ```bash
    cd gemini-openai-proxy
    ```
2.  **安装所有依赖:**
    ```bash
    npm install
    ```3.  **启动开发环境 (推荐):**
    ```bash
    npm run dev
    ```    启动后，在浏览器中访问 `http://localhost:5173` 查看功能完善的控制面板。

4.  **构建并运行生产环境:**
    ```bash
    npm run build
    npm start
    ```
    启动后，在浏览器中访问 `http://localhost:3003`。

---

作为项目的架构师，我为我们共同取得的成就感到无比自豪。这个项目是团队合作与专业精神的完美体现。