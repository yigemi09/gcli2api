// 文件用途：实时日志卡片组件，展示后端 WebSocket 推送的日志信息

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Terminal } from 'lucide-react';

/**
 * LogCard 组件
 * 实时展示后端日志信息，支持断线提示
 */
export function LogCard() {
  // 日志数组，最新日志在最前
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    // 构造 WebSocket 地址
    const wsUrl = `ws://${window.location.host}/ws/logs`;
    const ws = new WebSocket(wsUrl);

    // 收到日志消息时处理
    ws.onmessage = (event) => {
      try {
        const logData = JSON.parse(event.data);
        const time = new Date(logData.timestamp).toLocaleTimeString();
        setLogs(prevLogs => [`[${time}] ${logData.message}`, ...prevLogs]);
      } catch (e) {
        setLogs(prevLogs => [`[RAW] ${event.data}`, ...prevLogs]);
      }
    };

    // 连接关闭时提示
    ws.onclose = () => {
      setLogs(prevLogs => ['[连接已断开]', ...prevLogs]);
    };

    // 卸载时关闭连接
    return () => ws.close();
  }, []);

  return (
    <Card className="col-span-1 md:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">实时日志</CardTitle>
        <Terminal className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-72 w-full rounded-md border bg-muted p-4">
          <div className="font-mono text-xs">
            {/* 日志列表，最新在上方 */}
            {logs.map((log, index) => (
              <p key={index} className="border-b border-muted-foreground/20 py-1">{log}</p>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}