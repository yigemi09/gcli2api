// 文件用途：服务器状态卡片组件，展示后端服务运行状态、端口等信息

import { useState, useEffect } from 'react';
// 导入 UI 卡片组件
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// 导入状态徽章组件
import { Badge } from '@/components/ui/badge';
// 导入图标
import { Server } from 'lucide-react';

/**
 * StatusCard 组件
 * 展示服务器运行状态、监听端口等信息
 */
export function StatusCard() {
  // 状态：服务状态、端口、运行时长
  const [status, setStatus] = useState({ status: 'loading', port: 0, uptime: 0 });

  useEffect(() => {
    // 获取服务状态
    const fetchStatus = () => {
      fetch('/api/status')
        .then(res => res.json())
        .then(data => setStatus({ ...data, status: 'running' }))
        .catch(() => setStatus({ status: 'error', port: 0, uptime: 0 }));
    };
    fetchStatus();
    // 定时刷新
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const isRunning = status.status === 'running';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">服务器状态</CardTitle>
        <Server className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {/* 根据状态显示不同颜色的徽章 */}
          <Badge variant={isRunning ? 'default' : 'destructive'}>
            {isRunning ? '运行中' : '已停止'}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          监听端口: {status.port || 'N/A'}
        </p>
      </CardContent>
    </Card>
  );
}