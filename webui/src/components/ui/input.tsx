{
  /*
   * @file: gemini-openai-proxy/webui/src/components/ui/input.tsx
   * @purpose: 定义一个通用的、可定制样式的输入框（Input）组件。
   */
}
import * as React from 'react';
import { cn } from '@/lib/utils';

// 定义 Input 组件的 props 类型接口
export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

// Input 组件定义
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        // 使用 cn 工具函数合并基础样式和自定义样式
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };