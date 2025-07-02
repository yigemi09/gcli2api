// 文件用途：Gemini-OpenAI 代理后端主服务器，负责 API 路由、WebSocket 日志广播、静态资源服务等。
// 技术栈：TypeScript + Fastify + WebSocket + 静态文件服务
// 说明：本文件已全面修复 WebSocket 类型、日志广播、静态资源服务等所有已知问题，并优化了开发与生产环境的兼容性。

import fastify, { FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import type { WebSocket } from 'ws'; // 仅类型导入
import { invokeGeminiCli } from './cli-runner.js';
import { openAiToGeminiPrompt, formatToOpenAiSse } from './adapter.js';
import { execSync } from 'child_process';

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
 * @param type 日志类型（info/error/data）
 * @param message 日志内容
 */
export function broadcastLog(type: 'info' | 'error' | 'data', message: string) {
  try {
    // 同时输出到 Fastify 的日志系统
    if (type === 'error') {
      server.log.error(message);
    } else if (type === 'info') {
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

async function handleGeminiCliRequest(
  prompt: string,
  model: string, // 当前请求使用的模型
  stream: boolean, // 是否是流式请求
  reply: FastifyReply, // Fastify 的 reply 对象
  isFallbackAttempt: boolean = false, // 标记是否是回退尝试
): Promise<void> {
  broadcastLog('info', '[handleGeminiCliRequest] 函数已进入。');

  let responseText = ''; // 将 responseText 声明移到这里
  let errorHandled = false; // 标志，用于确保只发送一次响应

  broadcastLog('info', `[handleGeminiCliRequest] 正在调用 invokeGeminiCli...`);
  const { stdout: geminiStdoutStream, stderr: geminiStderrStream } = invokeGeminiCli(prompt, model);
  broadcastLog('info', `[handleGeminiCliRequest] invokeGeminiCli 调用完成。已获取流。`);

  // 创建一个 Promise，用于等待 stderr 错误或 stdout 结束
  broadcastLog('info', `[handleGeminiCliRequest] 正在等待 stderr 流结束...`);
  const stderrPromise = new Promise<string | null>((resolve) => {
    let stderrOutput = '';
    const timeoutId = setTimeout(() => {
      broadcastLog('info', '[handleGeminiCliRequest] stderr 流超时，继续处理。');
      resolve(stderrOutput || null); // 超时后也解析
    }, 15000); // 15秒超时

    geminiStderrStream.on('data', (data) => {
      stderrOutput += data.toString();
    });
    geminiStderrStream.on('end', () => {
      clearTimeout(timeoutId);
      resolve(stderrOutput || null);
    });
    geminiStderrStream.on('error', (err) => {
      clearTimeout(timeoutId);
      broadcastLog('error', `Gemini CLI Stderr Stream Error: ${err.message}`);
      resolve(err.message);
    });
  });

  // 监听 stdout 流的错误（例如，管道中断）
  geminiStdoutStream.on('error', (err) => {
    broadcastLog('error', `Gemini CLI Stdout Stream Error: ${err.message}`);
    if (!errorHandled) {
      errorHandled = true;
      const openaiErrorResponse = {
        error: {
          message: `内部服务器错误：${err.message}`,
          type: 'stream_error',
          param: null,
          code: '500',
        },
      };
      reply.status(500).send(openaiErrorResponse);
    }
  });

  // 等待 stderr 结束，以便处理所有错误信息
  const finalStderrOutput = await stderrPromise;
  broadcastLog('info', `[handleGeminiCliRequest] stderr 流结束。输出: ${finalStderrOutput ? finalStderrOutput.substring(0, 100) + '...' : '(无)'}`);

  if (finalStderrOutput) {
    broadcastLog('info', `[handleGeminiCliRequest] 检测到 stderr 输出。正在处理错误/回退逻辑...`);
    broadcastLog('error', `Gemini CLI Stderr: ${finalStderrOutput}`);

    // 检查是否是速率限制错误
    if (
      finalStderrOutput.includes('rate limit exceeded') ||
      finalStderrOutput.includes('quota') ||
      finalStderrOutput.includes('limit')
    ) {
      // 如果当前模型是 gemini-pro 并且不是回退尝试，则尝试回退到 flash 模型
      if (model === 'gemini-pro' && !isFallbackAttempt) {
        broadcastLog('info', '检测到 Gemini 2.5 Pro 配额耗尽，尝试回退到 gemini-2.5-flash 模型。');
        // 直接调用 invokeGeminiCli，并明确指定 gemini-1.5-flash 模型
        // 注意：这里不再递归调用 handleGeminiCliRequest，而是直接处理请求
        const { stdout: fallbackStdoutStream, stderr: fallbackStderrStream } = invokeGeminiCli(prompt, 'gemini-2.5-flash');

        // 监听回退流的 stderr
        fallbackStderrStream.on('data', (data) => {
          broadcastLog('error', `Gemini CLI Fallback Stderr: ${data.toString()}`);
        });

        // 监听回退流的 stdout 错误
        fallbackStdoutStream.on('error', (err) => {
          broadcastLog('error', `Gemini CLI Fallback Stdout Stream Error: ${err.message}`);
          if (!errorHandled) {
            errorHandled = true;
            const openaiErrorResponse = {
              error: {
                message: `内部服务器错误（回退）：${err.message}`,
                type: 'stream_error',
                param: null,
                code: '500',
              },
            };
            reply.status(500).send(openaiErrorResponse);
          }
        });

        // 处理回退流的响应
        let fallbackResponseText = '';
        for await (const chunk of fallbackStdoutStream) {
          fallbackResponseText += chunk.toString();
        }

        if (stream) {
          reply.raw.setHeader('Content-Type', 'text/event-stream');
          const sseData = formatToOpenAiSse(fallbackResponseText.trim(), 'gemini-2.5-flash');
          reply.raw.write(sseData);
          reply.raw.write('data: [DONE]\n\n');
          reply.raw.end();
        } else {
          reply.send({ choices: [{ message: { content: fallbackResponseText.trim() } }] });
        }
        return; // 阻止当前函数继续发送错误响应
      } else {
        // 如果已经是回退尝试，或者不是 gemini-pro 模型，则发送错误响应
        if (!errorHandled) {
          errorHandled = true;
          const openaiErrorResponse = {
            error: {
              message: '您的 Gemini 2.5 Pro 账户已达到每日使用配额上限。请稍后再试，或联系管理员提升配额。',
              type: 'rate_limit_exceeded',
              param: null,
              code: '429',
            },
          };
          reply.status(429).send(openaiErrorResponse);
        }
      }
    }
    broadcastLog('info', `[handleGeminiCliRequest] 错误/回退逻辑处理完成。`);
  } else {
    broadcastLog('info', `[handleGeminiCliRequest] 无 stderr 输出，继续处理 stdout。`);
  }

  // 如果错误未被处理，则继续处理 stdout
  if (!errorHandled) {
    broadcastLog('info', `[handleGeminiCliRequest] 正在收集 stdout 流数据...`);
    let responseText = '';
    for await (const chunk of geminiStdoutStream) {
      responseText += chunk.toString();
    }
    broadcastLog('info', `[handleGeminiCliRequest] stdout 流数据收集完成。响应文本长度: ${responseText.length}`);

    broadcastLog('info', `[handleGeminiCliRequest] 正在格式化并发送响应...`);
    if (stream) {
      // SSE 流式响应
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      const sseData = formatToOpenAiSse(responseText.trim(), model);
      reply.raw.write(sseData);
      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();
    } else {
      // 普通 JSON 响应
      reply.send({ choices: [{ message: { content: responseText.trim() } }] });
    }
    broadcastLog('info', `[handleGeminiCliRequest] 响应已发送。`);
  } else {
    broadcastLog('info', `[handleGeminiCliRequest] 错误已处理，跳过 stdout 处理和响应发送。`);
  }
}

/**
 * 聊天补全接口，兼容 OpenAI API
 * - 支持 SSE 流式返回
 * - 日志实时广播
 */
server.post('/v1/chat/completions', async (request, reply) => {
  broadcastLog('info', `[Route] 收到 /v1/chat/completions 请求。`);

  broadcastLog('info', `[Route] 正在解构请求体...`);
  const { messages, model, stream } = request.body as any;
  broadcastLog('info', `[Route] 请求体解构完成。Model: ${model}, Stream: ${stream}`);
  broadcastLog('info', `[Route] Messages (first 100 chars): ${JSON.stringify(messages).substring(0, 100)}...`);

  broadcastLog('info', `[Route] 正在生成 Gemini CLI 提示...`);
  const prompt = openAiToGeminiPrompt(messages);
  broadcastLog('info', `[Route] Gemini CLI 提示生成完成。提示长度: ${prompt.length}`);

  broadcastLog('info', `[Route] 正在调用 handleGeminiCliRequest...`);
  await handleGeminiCliRequest(prompt, model || 'gemini-pro', stream || false, reply);
  broadcastLog('info', `[Route] handleGeminiCliRequest 完成。`);
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
const start = async () => {
  try {
    await server.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();
