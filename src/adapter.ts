// gemini-openai-proxy/src/adapter.ts
// 本文件用于在 OpenAI 与 Gemini CLI 之间进行数据格式适配。
// 提供消息格式转换与流格式转换工具，确保两端协议兼容。
// 适用于 Gemini CLI 代理服务的核心数据流转场景。

import { Readable } from 'stream';
import { broadcastLog } from './server.js';

/**
 * OpenAI 消息对象接口
 * 表示 OpenAI 聊天接口中的单条消息
 */
export interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * OpenAI SSE 聊天补全块接口
 * 用于 SSE 流式响应的单个数据块
 */
export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: [
    {
      index: number;
      delta: {
        content?: string;
        role?: 'assistant';
      };
      finish_reason: string | null;
    }
  ];
}

/**
 * 将 OpenAI 消息数组转换为 Gemini CLI 所需的单字符串提示。
 * 每条消息带有角色前缀，便于模型理解上下文。
 * @param messages OpenAI 消息数组
 * @returns 合并后的字符串提示
 * @throws TypeError 如果输入不是有效的消息数组
 */
export function openAiToGeminiPrompt(messages: OpenAiMessage[]): string {
  broadcastLog('info', '[Adapter] 开始将 OpenAI 消息转换为 Gemini 提示。');
  if (!Array.isArray(messages)) {
    broadcastLog('error', '[Adapter] messages 参数类型错误，必须为 OpenAiMessage 数组。');
    throw new TypeError('messages 必须为 OpenAiMessage 数组');
  }
  let prompt = '';
  for (const message of messages) {
    // 为每个角色添加前缀，便于模型区分对话历史
    prompt += `[${message.role.toUpperCase()}]\n${message.content}\n\n`;
  }
  broadcastLog('info', `[Adapter] Gemini 提示生成完成，长度: ${prompt.length}。`);
  return prompt;
}

/**
 * 将完整的文本响应格式化为 OpenAI SSE 格式的字符串。
 * @param text 完整的文本响应。
 * @param model 模型名称。
 * @returns 格式化后的 SSE 字符串。
 */
export function formatToOpenAiSse(text: string, model: string): string {
  broadcastLog('info', `[Adapter] 开始将文本响应格式化为 OpenAI SSE 格式。模型: ${model}`);
  const sseData = {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: {
          content: text,
        },
        logprobs: null,
        finish_reason: 'stop',
      },
    ],
  };
  broadcastLog('info', '[Adapter] OpenAI SSE 格式化完成。');
  return `data: ${JSON.stringify(sseData)}

`;
}