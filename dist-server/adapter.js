// gemini-openai-proxy/src/adapter.ts
// 本文件用于在 OpenAI 与 Gemini CLI 之间进行数据格式适配。
// 提供消息格式转换与流格式转换工具，确保两端协议兼容。
// 适用于 Gemini CLI 代理服务的核心数据流转场景。
/**
 * 从文本内容中过滤掉内部使用的标记（如 <thinking>）。
 * @param text 待过滤的文本
 * @returns 过滤后的文本
 */
function filterInternalTags(text) {
    let cleanedContent = text;
    // Regex to remove <thinking>...</thinking> and <pseudocode>...</pseudocode> blocks (case-insensitive, multiline)
    cleanedContent = cleanedContent.replace(/<thinking>.*?<\/thinking>/gis, '');
    cleanedContent = cleanedContent.replace(/<pseudocode>.*?<\/pseudocode>/gis, '');
    // Remove any leading/trailing whitespace after filtering
    cleanedContent = cleanedContent.trim();
    return cleanedContent;
}
/**
 * 将解析后的 Gemini 数据块转换为 OpenAI SSE 格式的字符串。
 * @param parsedChunk - 从 Gemini CLI 流中解析出的单个数据对象。
 * @param model - 本次请求使用的模型名称。
 * @returns 如果成功提取到内容，则返回格式化的 SSE 字符串；否则返回 null。
 */
export function formatToOpenAiSse(parsedChunk, model) {
    // 安全地从深层嵌套的对象中提取文本内容
    // 路径: parsedChunk?.candidates?.[0]?.content?.parts?.[0]?.text
    const rawText = parsedChunk?.candidates?.[0]?.content?.parts?.[0]?.text;
    // 如果没有提取到有效文本，则不生成数据块，直接返回 null
    if (!rawText) {
        return null;
    }
    // 过滤内部标签
    const filteredText = filterInternalTags(rawText);
    // 如果过滤后文本为空，则不生成数据块
    if (filteredText.length === 0) {
        return null;
    }
    // 构建符合 OpenAI SSE 规范的响应负载，使用过滤后的文本
    const ssePayload = {
        id: `chatcmpl-${Date.now().toString(36)}`, // 使用更随机的ID
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [
            {
                index: 0,
                delta: {
                    content: filteredText, // 使用过滤后的文本
                },
                // 根据 OpenAI 流式 API 规范，中间块的 finish_reason 应为 null
                finish_reason: null,
            },
        ],
    };
    // 格式化为 "data: <JSON>\n\n" 的 SSE 标准格式
    return `data: ${JSON.stringify(ssePayload)}\n\n`;
}
