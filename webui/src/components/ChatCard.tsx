// 文件用途：API 聊天测试卡片组件，支持与后端 API 进行对话交互

import { useState, FormEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare } from 'lucide-react';

/**
 * 消息类型定义
 */
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * ChatCard 组件
 * 支持用户输入消息并通过 API 获取回复，流式展示助手响应
 */
export function ChatCard() {
  // 聊天消息列表
  const [messages, setMessages] = useState<Message[]>([]);
  // 输入框内容
  const [input, setInput] = useState('');
  // 加载状态
  const [isLoading, setIsLoading] = useState(false);

  /**
   * 提交表单，发送用户消息并处理 API 响应
   */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // 输入为空或正在加载时不处理
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      // 向后端发送消息，开启流式响应
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gemini-pro', messages: newMessages, stream: true }),
      });

      if (!res.ok || !res.body) throw new Error(`API Error: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';
      // 先插入一个空的助手消息
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            if (data.trim() === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices[0]?.delta?.content || '';
              assistantMessage += delta;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1].content = assistantMessage;
                return updated;
              });
            } catch (e) {
              // 忽略解析异常
            }
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errorMessage}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="col-span-1 md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center">
          <MessageSquare className="h-5 w-5 mr-2" /> API 聊天测试
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64 w-full rounded-md border p-4 mb-4">
          {/* 聊天消息列表，区分用户和助手 */}
          {messages.map((m, i) => (
            <div key={i} className={`mb-2 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <span className={`inline-block p-2 rounded-lg ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-muted'}`}>
                {m.content}
              </span>
            </div>
          ))}
        </ScrollArea>
        <form onSubmit={handleSubmit} className="flex w-full items-center space-x-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入消息测试 API..."
            disabled={isLoading}
          />
          <Button type="submit" disabled={isLoading}>
            {isLoading ? '...' : '发送'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}