# Gemini OpenAI Proxy

## 1. 项目功能总览与核心原理

**Gemini OpenAI Proxy** 是一个功能完备、带有 Web UI 控制面板的全栈应用。它作为您与 Google Gemini API 交互的强大代理服务，旨在解决以下核心问题：

-   **统一 API 接口:** 提供一个与 OpenAI Chat Completions API 完全兼容的接口 (`/v1/chat/completions`)，让任何支持 OpenAI API 的第三方应用（如 LobeChat, NextChat, Vercel AI Playground 等）都能无缝地、无需修改地使用 Google Gemini 模型能力。
-   **简化认证:** 本代理服务通过 **Google AI Node.js SDK** 直接与 Google Gemini API 进行交互。您只需遵循标准的 Google Cloud 认证流程（通常是本地存储凭证），本代理服务将自动利用这个已建立的认证，您无需为任何第三方应用单独配置或暴露您的 API 密钥。
-   **零配置启动:** 项目完全自包含，不依赖任何全局安装。用户只需遵循标准的 `git clone` -> `npm install` -> `npm start/dev` 流程即可启动，极大降低了使用门槛。

---

## 2. 架构与工具原理

本项目是一个基于 TypeScript 的全栈 monorepo 式项目，其核心架构如下：

```mermaid
graph TD
    %% 用户端
    subgraph userClient[用户浏览器/第三方应用]
        A[Web UI (React + Tailwind)]
        B[OpenAI 兼容客户端]
    end

    %% 代理服务
    subgraph proxyApp[gemini-openai-proxy（我们的应用）]
        subgraph backend[Fastify 后端（Node.js）]
            C[API 代理: /v1/chat/completions]
            D[Web UI API: /api/status]
            E[静态资源服务: /]
            F[实时日志 WebSocket: /ws/logs]
        end
        H[Google AI Node.js SDK]
    end

    %% Gemini API
    subgraph geminiAPI[Google Gemini API（云服务）]
        I[cloudcode-pa.googleapis.com]
    end

    A -->|加载主页| E
    A -->|请求状态| D
    A -->|建立日志连接| F
    A -->|发送聊天| C
    B -->|调用 API| C

    C --> H
    H --> I
    I --> H
    H --> C
    F -->|广播日志| A
```

-   **后端 (`src/server.ts`):** 使用轻量级、高性能的 **Fastify** 框架构建。
    *   作为核心代理，它处理所有 `/v1/chat/completions` 请求，将 OpenAI 格式转换为 Gemini API 格式。
    *   通过 `@fastify/static` 托管前端 Web UI。
    *   通过 `@fastify/websocket` 提供实时的操作日志，方便调试和监控。
    *   实现了健壮的消息内容处理（例如 `extractTextContent`）和内部内容过滤（例如 `filterInternalTags`），确保与 Gemini API 的兼容性和回复的纯净性。
-   **Gemini API 交互层 (`src/gemini-provider.ts`):** 封装了与 Google Gemini API 的所有交互逻辑。
    *   利用 **Google AI Node.js SDK** 直接进行 API 调用，而不是依赖外部 CLI 工具。
    *   管理 OAuth2.0 认证流程，包括凭证的加载、刷新和持久化。
    *   负责将处理后的用户/模型消息和系统指令 (`systemInstruction`) 转换为 Gemini API 所需的 `contents` 格式。
    *   统一的 `broadcastLog` 函数用于内部日志输出。
-   **数据适配 (`src/adapter.ts`):** 负责将 Gemini API 的响应格式转换为 OpenAI SSE 兼容格式。
    *   在转换过程中，会应用内容过滤（例如 `filterInternalTags`），确保发送给客户端的文本不包含内部思考或指令。
-   **前端 (Web UI):** 使用 **Vite** + **React** + **TypeScript** 的现代化技术栈构建。UI 方面，集成了 **Shadcn/UI** 和 **Tailwind CSS**，提供专业和美观的控制面板。

---

## 3. 如何使用

遵循以下步骤即可快速启动和运行 **Gemini OpenAI Proxy**：

1.  **进行 Google Cloud 认证:**
    在运行代理服务之前，您需要确保已经完成了 Google Cloud 认证，以便代理能够访问 Gemini API。最简单的方式是**安装并运行一次 `gemini-cli` 工具并登录您的 Google 账号**。这将会在您的主目录下生成必要的 OAuth 凭证（通常在 `~/.gemini/oauth_creds.json`），本代理服务将自动使用这些凭证。
    *   如果您尚未安装 `gemini-cli`，可以按照官方指南进行安装。
    *   运行 `gemini` 命令并按照提示登录：`gemini`
2.  **克隆项目:**
    ```bash
    git clone https://github.com/your-repo/gemini-openai-proxy.git
    cd gemini-openai-proxy
    ```
3.  **安装所有依赖:**
    ```bash
    npm install
    ```
    此命令会安装所有必要的 Node.js 依赖，包括 Google AI Node.js SDK。
4.  **启动开发环境 (推荐):**
    ```bash
    npm run dev
    ```
    启动成功后，在浏览器中访问 `http://localhost:5173` 即可查看不太完善的控制面板。查看服务器状态和实时日志。
5.  **构建并运行生产环境:**
    ```bash
    npm run build
    npm start
    ```
    这将编译项目并以生产模式启动服务器。Web UI 将在后端服务相同的端口 (`http://localhost:3003` 或您配置的端口) 提供。

---

## 4. OpenAI 兼容 API 使用指南

本代理服务提供一个与 OpenAI Chat Completions API (`/v1/chat/completions`) 完全兼容的接口，这意味着您可以将任何支持 OpenAI API 的客户端或应用配置为使用本代理服务来与 Google Gemini 模型交互。

### API Endpoint 配置

要使用本代理服务，您需要将客户端的 API **基础 URL (Base URL)** 或 **API Endpoint** 配置为代理服务的地址。

*   **开发环境:** `http://localhost:3003/v1/chat/completions` (如果通过 `npm run dev` 启动，前端通常会在 `5173` 端口访问后端 `3003` 端口)
*   **生产环境:** 部署后的服务器地址，例如 `http://your-server-ip:3003/v1/chat/completions` 或 `https://your-domain.com/v1/chat/completions`

**请注意:** 代理服务监听在 `3003` 端口（可在 `src/server.ts` 中配置）。

### API Key 配置 (占位符)

由于本代理服务负责与 Google Gemini API 的认证，并利用您本地的 Google Cloud 凭证，因此对于客户端来说，**无需提供真实的 Gemini API Key**。

然而，许多 OpenAI 兼容客户端会强制要求填写 API Key。在这种情况下，您可以填写任何非空字符串作为占位符（例如 `sk-gcli2api` 或 `YOUR_API_KEY`），只要它不是空的，客户端通常就能正常工作。

### 示例配置 (以 `curl` 为例)

以下是如何使用 `curl` 命令调用代理 API 的一个简单示例：

```bash
curl http://localhost:3003/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-gcli2api-placeholder" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [
      {"role": "user", "content": "你好，请给我讲一个关于人工智能的简短故事。"}
    ],
    "stream": true
  }'
```

**重要提示:**
*   `model` 字段应指定为代理支持的 Gemini 模型，例如 `gemini-2.5-flash` 或 `gemini-2.5-pro`。
*   `Authorization` 头中的 `Bearer` token 可以是任何非空字符串，因为代理层会处理实际的 Google 认证。
*   `stream: true` 支持流式响应，客户端会逐块接收模型生成的文本。
