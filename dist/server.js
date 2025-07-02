// gemini-openai-proxy/src/server.ts
// 本文件为 Gemini-OpenAI 兼容代理服务主入口，负责 HTTP 服务启动、请求参数校验、Gemini CLI 调用、流式与非流式响应转换等核心逻辑。
// 适配 OpenAI /v1/chat/completions 接口，支持 SSE 流式与普通响应，便于无缝对接各类 OpenAI 客户端。
// 主要依赖 Fastify、Node.js 子进程、流处理等技术栈。所有关键逻辑均有详细中文注释，便于理解和维护。
import fastify from 'fastify';
import { invokeGeminiCli } from './cli-runner.js';
import { openAiToGeminiPrompt, transformStreamToOpenAiSse } from './adapter.js';
// --- Fastify 服务器初始化，开启日志 ---
const server = fastify({
    logger: true,
});
// --- OpenAI 兼容 API 路由实现 ---
server.post('/v1/chat/completions', async (request, reply) => {
    /**
     * 解析请求体，校验参数类型
     * messages: 聊天消息数组，必填
     * model: 使用的模型名称，选填
     * stream: 是否流式响应，选填
     */
    const { messages, model, stream } = request.body;
    // --- 参数校验，确保 messages 存在且为数组 ---
    if (!messages || !Array.isArray(messages)) {
        return reply.code(400).send({ error: 'Field "messages" is required and must be an array.' });
    }
    // --- 1. OpenAI 消息格式转换为 Gemini Prompt ---
    const prompt = openAiToGeminiPrompt(messages);
    // --- 2. 调用 Gemini CLI，返回可读流 ---
    const geminiStream = invokeGeminiCli(prompt);
    // --- 3. 根据 stream 参数分流处理 ---
    if (stream) {
        // --- 流式响应：设置 SSE 头部，管道 Gemini 输出到 HTTP 响应 ---
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        // --- 创建 Gemini 到 OpenAI SSE 的格式转换流 ---
        const sseTransformer = transformStreamToOpenAiSse(model || 'gemini-pro');
        // --- 管道：Gemini 输出 -> 格式转换 -> HTTP 响应 ---
        geminiStream.pipe(sseTransformer).pipe(reply.raw);
        // --- 客户端断开时，销毁子进程，防止资源泄漏 ---
        request.socket.on('close', () => {
            geminiStream.destroy();
            console.log('Client disconnected, Gemini process terminated.');
        });
    }
    else {
        // --- 非流式响应：收集 Gemini 输出，组装 OpenAI 格式响应 ---
        try {
            let responseText = '';
            for await (const chunk of geminiStream) {
                responseText += chunk.toString();
            }
            // --- 构造 OpenAI 兼容响应体 ---
            const responsePayload = {
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: model || 'gemini-pro',
                choices: [{
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: responseText.trim(),
                        },
                        finish_reason: 'stop',
                    }],
                // usage 字段可按需扩展
            };
            reply.send(responsePayload);
        }
        catch (error) {
            // --- 错误处理：日志记录并返回 500 ---
            server.log.error(error, 'Error processing non-streamed response');
            reply.code(500).send({ error: 'Failed to process response from Gemini CLI' });
        }
    }
});
// --- 服务器启动逻辑，支持 PORT 环境变量配置 ---
const start = async () => {
    try {
        const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
        await server.listen({ port, host: '0.0.0.0' });
    }
    catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};
// --- 启动服务 ---
start();
