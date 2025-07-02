// gemini-openai-proxy/src/adapter.ts
// 本文件用于在 OpenAI 与 Gemini CLI 之间进行数据格式适配。
// 提供消息格式转换与流格式转换工具，确保两端协议兼容。
// 适用于 Gemini CLI 代理服务的核心数据流转场景。
import { Transform } from 'stream';
/**
 * 将 OpenAI 消息数组转换为 Gemini CLI 所需的单字符串提示。
 * 每条消息带有角色前缀，便于模型理解上下文。
 * @param messages OpenAI 消息数组
 * @returns 合并后的字符串提示
 * @throws TypeError 如果输入不是有效的消息数组
 */
export function openAiToGeminiPrompt(messages) {
    if (!Array.isArray(messages)) {
        throw new TypeError('messages 必须为 OpenAiMessage 数组');
    }
    let prompt = '';
    for (const message of messages) {
        // 为每个角色添加前缀，便于模型区分对话历史
        prompt += `[${message.role.toUpperCase()}]\n${message.content}\n\n`;
    }
    return prompt;
}
/**
 * 创建一个 Transform 流，将 Gemini CLI 的原始文本块转换为 OpenAI SSE 格式的块。
 * 用于实现 OpenAI 兼容的流式响应。
 * @param model 模型名称（从原始请求获取）
 * @returns Node.js Transform 流对象
 * @throws TypeError 如果 model 不是字符串
 */
export function transformStreamToOpenAiSse(model) {
    if (typeof model !== 'string' || !model) {
        throw new TypeError('model 必须为非空字符串');
    }
    let isFirstChunk = true;
    return new Transform({
        transform(chunk, encoding, callback) {
            try {
                const text = chunk.toString();
                // 首块输出 assistant 角色 delta
                if (isFirstChunk) {
                    const firstChunkPayload = {
                        id: `chatcmpl-${Date.now()}`,
                        object: 'chat.completion.chunk',
                        created: Math.floor(Date.now() / 1000),
                        model,
                        choices: [
                            {
                                index: 0,
                                delta: { role: 'assistant' },
                                finish_reason: null,
                            },
                        ],
                    };
                    this.push(`data: ${JSON.stringify(firstChunkPayload)}\n\n`);
                    isFirstChunk = false;
                }
                // 每个文本块输出 content delta
                const chunkPayload = {
                    id: `chatcmpl-${Date.now()}`,
                    object: 'chat.completion.chunk',
                    created: Math.floor(Date.now() / 1000),
                    model,
                    choices: [
                        {
                            index: 0,
                            delta: { content: text },
                            finish_reason: null,
                        },
                    ],
                };
                // 推送 SSE 格式数据
                this.push(`data: ${JSON.stringify(chunkPayload)}\n\n`);
                callback();
            }
            catch (err) {
                // 捕获并传递流处理异常
                callback(err);
            }
        },
    });
}
