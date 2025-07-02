# Gemini OpenAI Proxy - 实施计划

## 1. 项目目标

创建一个独立的、轻量级的 Node.js HTTP 服务，该服务作为 Google Gemini CLI 的代理。它将提供一个与 OpenAI Chat Completions API (`/v1/chat/completions`) 兼容的接口，使得任何支持 OpenAI API 的客户端（如 LobeChat, NextChat 等）都能够无缝地利用本地安装和认证的 Gemini CLI 来与 Gemini 模型进行交互。

## 2. 核心特性

- **OpenAI API 兼容:** 实现 `/v1/chat/completions` 端点，支持标准请求格式。
- **独立运行:** 作为一个独立的 Node.js 应用运行，不侵入 Gemini CLI 源代码。
- **动态交互:** 通过子进程与本地安装的 `gemini` 命令进行交互，利用其非交互式模式。
- **流式响应:** 完全支持 `stream: true` 参数，提供与原生 OpenAI API 一致的实时打字机体验。
- **自动检测:** 启动时自动检测 `gemini` 命令是否存在。

## 3. 技术架构

该服务作为客户端和 Gemini CLI 之间的桥梁。

```mermaid
graph TD
    subgraph "您的本地应用"
        A[任意 OpenAI 兼容客户端]
    end

    subgraph "gemini-openai-proxy (本应用)"
        B[HTTP Server (Fastify)]
        C[API Endpoint: /v1/chat/completions]
        D[请求/响应格式转换器]
        E[Gemini CLI 子进程管理器]
    end

    subgraph "已安装的 Gemini CLI"
        F[gemini 命令 (可执行文件)]
    end

    subgraph "外部服务"
        G[Google Gemini API]
    end

    A -- "1. OpenAI API 请求" --> C
    C -- "2. 解析请求" --> D
    D -- "3. 转换为 Gemini CLI 的输入" --> E
    E -- "4. 调用 gemini 命令 (spawn child_process)" --> F
    F -- "5. 使用缓存的认证与 Google 通信" --> G
    G -- "6. Gemini API 响应" --> F
    F -- "7. 将结果流式输出到 stdout" --> E
    E -- "8. 捕获子进程流式输出" --> D
    D -- "9. 转换为 OpenAI API 流式格式" --> C
    C -- "10. OpenAI API 流式响应" --> A
```

## 4. 详细实施步骤

### 第一步：项目初始化

1.  **目录结构:** 创建 `gemini-openai-proxy/` 目录。
2.  **`package.json`:** 初始化项目，定义依赖：
    -   `dependencies`: `fastify`
    -   `devDependencies`: `typescript`, `@types/node`, `@types/fastify`
3.  **`tsconfig.json`:** 配置 TypeScript 编译选项 (ESM, a modern target)。
4.  **`src/` 目录:** 创建源代码目录。

### 第二步：HTTP 服务器 (`src/server.ts`)

1.  使用 Fastify 创建一个 HTTP 服务器实例。
2.  实现 `POST /v1/chat/completions` 端点。
3.  从请求中安全地解析 `messages`, `model`, `stream` 等字段。
4.  实现启动逻辑，允许通过命令行参数（如 `--port`）配置端口。

### 第三步：Gemini CLI 调用器 (`src/cli-runner.ts`)

1.  **`invokeGeminiCli` 函数:** 这是与 Gemini CLI 交互的核心。
2.  **启动时检查:** 在服务启动时，通过 `child_process.execSync('gemini --version')` 检查 `gemini` 命令是否在系统 `PATH` 中。如果不存在，则向用户显示错误信息并退出。
3.  **子进程执行:**
    -   使用 `child_process.spawn('gemini')` 启动子进程。
    -   将转换后的提示字符串写入子进程的 `stdin`。
    -   调用 `child.stdin.end()` 来表示输入结束。
4.  **返回流:** 该函数将返回子进程的 `stdout` 流，以便上层可以处理流式数据。

### 第四步：格式适配器 (`src/adapter.ts`)

1.  **`openAiToGeminiPrompt` 函数:**
    -   接收 OpenAI 的 `messages` 数组。
    -   将其转换为一个单一的、适合 `stdin` 输入的字符串提示。策略是使用 `USER:` 和 `ASSISTANT:` 等前缀来区分对话角色。
2.  **`transformStreamToOpenAiSse` 函数:**
    -   这是一个关键的转换函数，它接收来自 `cli-runner` 的 `stdout` 可读流。
    -   它会返回一个新的可读流（Node.js `Transform` stream），这个流的输出符合 OpenAI 的 Server-Sent Events (SSE) 格式。
    -   对于 `stdout` 中的每个数据块，它会生成一个 `data: {...}\n\n` 格式的 OpenAI `ChatCompletionChunk`。

### 第五步：流式响应处理

1.  在 `/v1/chat/completions` 端点中，如果 `stream: true`：
    a.  立即设置响应头 `Content-Type: text/event-stream`。
    b.  调用 `openAiToGeminiPrompt` 准备输入。
    c.  调用 `invokeGeminiCli` 获取 `stdout` 流。
    d.  调用 `transformStreamToOpenAiSse` 获取转换后的 SSE 流。
    e.  使用 `stream.pipe(response)` 将 SSE 流直接管道到 Fastify 的响应对象中。
    f.  在流结束后，发送 `data: [DONE]\n\n` 消息。

### 第六步：非流式响应处理

1.  如果 `stream: false` (或未提供)：
    a.  仍然调用 `invokeGeminiCli`，但这次需要将 `stdout` 流中的所有数据块收集到一个完整的字符串中。
    b.  将完整的响应文本包装成一个单一的 OpenAI `ChatCompletion` JSON 对象。
    c.  将这个 JSON 对象作为 HTTP 响应发送。

### 第七步：错误处理

1.  为 `gemini` 子进程的 `stderr` 流设置监听器。
2.  如果 `stderr` 有输出或者子进程以非零代码退出，捕获错误信息。
3.  将错误信息包装成一个合法的 OpenAI API 错误 JSON 响应，并返回给客户端。

---

## 8. 获取模型列表 (`/v1/models`)

为了更好地兼容 OpenAI 生态，服务需要实现 `GET /v1/models` 端点。

1.  **创建 `GET /v1/models` 端点:** 在 Fastify 服务器中添加一个新的路由。
2.  **静态模型列表:** 由于 Gemini CLI 本身不提供动态获取模型列表的功能，我们将在代理服务中维护一个静态的、硬编码的模型列表。
3.  **响应格式:** 该端点将返回一个符合 OpenAI `list models` API 规范的 JSON 对象。列表将包含已知的、与 Gemini CLI 兼容的模型，如 `gemini-1.5-pro`, `gemini-1.5-flash` 等。

---

这份文档是我们实施项目的蓝图。下一步，我们需要切换到一个允许我们编写代码的模式，然后根据这份计划创建 `package.json`, `tsconfig.json` 和 `src/` 目录下的源文件。