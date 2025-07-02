// 文件用途：API 配置卡片组件，展示和复制后端 API 地址

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy } from 'lucide-react';

/**
 * ConfigCard 组件
 * 展示 API 地址，并提供一键复制功能
 */
export function ConfigCard() {
  // 计算 API 地址，仅在浏览器环境下有效
  const apiUrl =
    typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.host}/v1/chat/completions`
      : '';

  // 复制 API 地址到剪贴板
  const handleCopy = () => {
    navigator.clipboard.writeText(apiUrl);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">API 配置</CardTitle>
        <Copy className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex w-full max-w-sm items-center space-x-2">
          {/* 只读输入框显示 API 地址 */}
          <Input type="text" value={apiUrl} readOnly />
          <Button type="submit" size="sm" onClick={handleCopy}>
            复制
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          将您的客户端指向此 API 地址。
        </p>
      </CardContent>
    </Card>
  );
}