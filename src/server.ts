// 文件用途：Gemini-OpenAI 代理后端主服务器，负责 API 路由、WebSocket 日志广播、静态资源服务等。
// 技术栈：TypeScript + Fastify + WebSocket + 静态文件服务
// 说明：本文件已全面修复 WebSocket 类型、日志广播、静态资源服务等所有已知问题，并优化了开发与生产环境的兼容性。

import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import type { WebSocket } from 'ws'; // 仅类型导入
import { geminiProvider } from './gemini-provider.js';
import { formatToOpenAiSse } from './adapter.js';

// 获取当前目录，兼容 ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 端口与环境变量
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3003;
const IS_PROD = process.env.NODE_ENV === 'production';

// Fastify 实例，开发环境下美化日志
const server = fastify({
  logger: IS_PROD ? true : { transport: { target: 'pino-pretty' } },
  bodyLimit: 10 * 1024 * 1024 // 10MB limit, to be safe
});

// Global onRequest hook
server.addHook('onRequest', (request, reply, done) => {
  console.log(`[onRequest] Request received: ${request.method} ${request.url}`);
  console.log(`[onRequest] Content-Type: ${request.headers['content-type']}`);
  done();
});

// Global onError hook
server.setErrorHandler((error, request, reply) => {
  console.error(`[onError] Error during request: ${request.method} ${request.url}`);
  console.error(`[onError] Error details:`, error);
  reply.status(500).send({ error: 'Internal Server Error', message: error.message });
});

// ========================
// WebSocket 日志广播系统
// ========================

// 存储所有日志 WebSocket 客户端
const logConnections = new Set<WebSocket>();

/**
 * 广播日志到所有已连接的 WebSocket 客户端
 * @param type 日志类型（info/error/data/debug）
 * @param message 日志内容
 */
export function broadcastLog(type: 'info' | 'error' | 'data' | 'debug', message: string) {
  try {
    // 同时输出到 Fastify 的日志系统
    if (type === 'error') {
      server.log.error(message);
    } else if (type === 'info' || type === 'debug') { // 将 'debug' 和 'info' 同等对待
      server.log.info(message);
    } else {
      // 'data' 类型可以作为 info 输出，或者根据需要调整
      server.log.info(message);
    }

    const logMessage = JSON.stringify({
      type,
      message,
      timestamp: new Date().toISOString()
    });
    for (const socket of logConnections) {
      // 仅向已打开的连接发送
      if (socket.readyState === 1) { // WebSocket.OPEN === 1
        socket.send(logMessage);
      }
    }
  } catch (e: any) {
    server.log.error('Error broadcasting log:', e); // 使用 console.error 打印错误
  }
}

// ========================
// 静态文件服务（仅生产环境）
// ========================
if (IS_PROD) {
  // 静态资源目录
  const staticPath = path.join(__dirname, '..', 'dist-webui');
  if (fs.existsSync(staticPath)) {
    // 注册静态资源插件
    server.register(fastifyStatic, { root: staticPath, prefix: '/' });
    // SPA 回退路由，刷新页面时返回 index.html
    server.setNotFoundHandler((_req, reply) => {
      reply.sendFile('index.html');
    });
  } else {
    server.log.warn(`生产模式下未找到 UI 目录: ${staticPath}`);
  }
}

// ========================
// WebSocket 与 API 路由
// ========================

// 注册 WebSocket 插件
server.register(fastifyWebsocket);

// 日志 WebSocket 路由
server.register(async (fastify) => {
  fastify.get('/ws/logs', { websocket: true }, (connection) => {
    // connection.socket 为 ws.WebSocket 实例
    // @fastify/websocket 的 connection 本身就是 ws.WebSocket 实例
    const socket = connection as WebSocket;
    logConnections.add(socket);
    broadcastLog('info', '新的日志客户端已连接。');

    // 断开连接时移除
    socket.on('close', () => logConnections.delete(socket));
    socket.on('error', () => logConnections.delete(socket));
  });
});

// ========================
// OpenAI 兼容 API 路由
// ========================

server.post('/v1/chat/completions', async (request, reply) => {
  // 解析 OpenAI 格式请求体，分离 system 指令与对话消息
  // 解析 OpenAI 格式请求体，分离 system 指令与对话消息
  const { messages, model, stream } = request.body as any;
  broadcastLog('info', `收到对模型 ${model} 的请求, stream=${stream}`);

  /**
   * 分离 system 指令与对话消息
   * - systemInstruction: 合并所有 system 消息内容（用换行符连接）
   * - conversationMessages: 仅包含 user/assistant 消息
   */
  let systemInstruction = '';
  const conversationMessages: Array<{ role: string; content: string }> = [];
  /**
   * 提取 OpenAI 消息 content 字段中的文本内容，无论其为字符串、对象还是数组结构。
   * @param content 任意类型的 content 字段
   * @returns 提取出的文本内容，若无法提取则返回 null
   */
  function extractTextContent(content: any): string | null {
    // 1. 字符串类型，直接返回
    if (typeof content === 'string') {
      return content;
    }
    // 2. 数组类型，递归拼接所有 type: 'text' 且 text 为字符串的 text 字段
    if (Array.isArray(content)) {
      return content
        .map((item) => extractTextContent(item))
        .filter((txt) => typeof txt === 'string' && txt.trim().length > 0)
        .join('');
    }
    // 3. 对象类型，若有 type: 'text' 且 text 为字符串，返回 text
    if (
      content &&
      typeof content === 'object' &&
      content.type === 'text' &&
      typeof content.text === 'string'
    ) {
      return content.text;
    }
    // 4. 其他情况，无法提取
    return null;
  }

  if (Array.isArray(messages)) {
    for (const message of messages) {
      if (message && typeof message === 'object') {
        if (message.role === 'system' && message.content) {
          systemInstruction += (systemInstruction ? '\n' : '') + String(message.content).trim();
        } else if (
          (message.role === 'user' || message.role === 'assistant') &&
          message.content
        ) {
          const extractedContent = extractTextContent(message.content);
          if (typeof extractedContent === 'string' && extractedContent.trim().length > 0) {
            conversationMessages.push({
              role: message.role,
              content: extractedContent,
            });
          }
        }
      }
    }
  }
  // 输出分离结果日志，便于调试
  if (systemInstruction) {
    broadcastLog(
      'debug',
      `[server] 提取的 systemInstruction: ${
        systemInstruction.length > 100
          ? systemInstruction.substring(0, 100) + '...'
          : systemInstruction
      }`
    );
  }
  broadcastLog(
    'debug',
    `[server] 传递给 GeminiProvider 的对话消息数量: ${conversationMessages.length}`
  );

  /**
   * @description 辅助函数，用于解析 Gemini API 返回的 SSE (Server-Sent Events) 流。
   * @param stream 从 aUTH client 返回的 Node.js 可读流。
   * @returns 一个异步生成器，逐个 yield 解析出的 JSON 对象。
   */
  /**
   * 解析 SSE (Server-Sent Events) 数据流，并逐条产出 JSON 消息。
   * 本函数包含详细日志，便于诊断数据流解析的每个阶段。
   * @param stream 可读流（通常为 HTTP 响应体）
   * @yields 解析后的 JSON 对象
   */
  /**
   * 解析 SSE (Server-Sent Events) 数据流，并逐条产出 JSON 消息。
   * 本函数包含详细日志，便于诊断数据流解析的每个阶段。
   * @param stream 可读流（通常为 HTTP 响应体）
   * @yields 解析后的 JSON 对象
   */
  async function* parseSseStream(stream: import('stream').Readable): AsyncGenerator<any> {
    let buffer = '';
    const decoder = new TextDecoder('utf-8');

    // 逐块读取流数据
    for await (const chunk of stream) {
const decodedChunk = decoder.decode(chunk, { stream: true });
      buffer += decodedChunk; // 将新的数据追加到缓冲区

      let position;
      while ((position = buffer.indexOf('\n')) !== -1) {
        const line = buffer.substring(0, position).trim();
        buffer = buffer.substring(position + 1); // 移除已处理的行

        if (line.startsWith('data: ')) {
          const data = line.substring(6);
          if (data === '[DONE]') {
            // DONE 消息不应该被 yield，由上层处理
            continue;
          }
          try {
            const parsedData = JSON.parse(data);
            yield parsedData;
          } catch (e) {
            server.log.error({ err: e, rawData: data }, '解析 SSE JSON 数据失败');
          }
        } else if (line === '') {
          // 遇到空行（两个换行符之间），表示一个完整的事件结束，但此处通常由 `data:` 前缀处理
          // 对于非 `data:` 行，如果不是空行，则被忽略
        }
      }
    }
  }

  try {
    // 步骤 1: 调用 geminiProvider.createMessage，传递分离后的参数
    // conversationMessages: 仅 user/assistant 消息
    // model: 指定模型
    // systemInstruction: 合并后的 system 指令
    // 调用 GeminiProvider，传递分离后的参数，彻底避免 system 指令混入对话消息，防止 400 错误
    // 修正：仅传递 user/model 消息，且确保 content 为字符串，assistant 映射为 model
    /**
     * Gemini API 只接受 role 为 'user' 或 'model' 的消息，且 content 必须为字符串。
     * 这里将 OpenAI 格式的 'assistant' 映射为 'model'，并严格过滤。
     */
    const geminiMessages = conversationMessages
      .filter(
        (msg) =>
          (msg.role === 'user' || msg.role === 'assistant') &&
          typeof msg.content === 'string'
      )
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        content: msg.content,
      }));

    const response = await geminiProvider.createMessage(
      geminiMessages,
      model,
      systemInstruction
    );
    // 步骤 2: 从响应对象中提取 `.data` 属性，即 Node.js 的可读流。
    const messageStream = response.data;

    if (stream) {
      // --- 流式响应处理 ---
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');

      for await (const parsedChunk of parseSseStream(messageStream)) {
        const sseData = formatToOpenAiSse(parsedChunk, model);
        // 仅当 sseData 不为 null 时才写入流
        if (sseData) {
          reply.raw.write(sseData);
        }
      }

      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();
    } else {
      // --- 非流式响应处理 ---
      let fullContent = "";
      // 步骤 3: 遍历解析后的数据块，并从中提取文本内容进行拼接。
      for await (const parsedChunk of parseSseStream(messageStream)) {
        // 修正：正确提取非流式响应的文本内容，兼容 Google API 返回结构
        const text = parsedChunk?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          fullContent += text;
        }
      }
      reply.send({ choices: [{ message: { content: fullContent.trim() } }] });
    }
  } catch (error: any) {
    broadcastLog('error', `处理 /v1/chat/completions 请求时出错: ${error.message}`);
    server.log.error(error, `Request to /v1/chat/completions failed with model ${model}`);
    reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
      stack: IS_PROD ? undefined : error.stack // 仅在非生产环境暴露堆栈信息
    });
  }
});

/**
 * 状态检查接口
 */
server.get('/api/status', async (_request, reply) => {
  reply.send({ status: 'running', port: PORT, uptime: process.uptime() });
});

/**
 * 获取模型列表，兼容 OpenAI API
 */
server.get('/v1/models', async (_request, reply) => {
  broadcastLog('info', '收到 /v1/models 请求。');
  reply.send({
    object: 'list',
    data: [
      {
        id: 'gemini-2.5-pro',
        object: 'model',
        created: Date.now(),
        owned_by: 'google',
        permission: [],
        root: 'gemini-2.5-pro',
        parent: null,
      },
      {
        id: 'gemini-2.5-flash',
        object: 'model',
        created: Date.now(),
        owned_by: 'google',
        permission: [],
        root: 'gemini-2.5-flash',
        parent: null,
      },
    ],
  });
});

// ========================
// 启动逻辑
// ========================

/**
 * 启动 Fastify 服务器
 */
/**
 * 应用程序主入口
 */
const main = async () => {
  try {
    // 在服务器启动前确保 Gemini Provider 已通过认证
    broadcastLog('info', '正在验证 Gemini Provider 身份...');
    await geminiProvider.ensureAuthenticated();
    broadcastLog('info', 'Gemini Provider 身份验证成功。');
    
    // 启动 Fastify 服务器
    await server.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    server.log.error('应用程序启动失败:', err);
    process.exit(1);
  }
};

main();