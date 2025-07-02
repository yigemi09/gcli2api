{
  /*
   * @file: gemini-openai-proxy/webui/src/components/ui/badge.tsx
   * @purpose: 定义徽章（Badge）组件，用于显示状态、标签或少量信息。
   */
}
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// 定义徽章的样式变体
// `cva` (class-variance-authority) 是一个函数，可以根据不同的属性（variants）返回不同的 CSS 类名
const badgeVariants = cva(
  // 基础样式：适用于所有徽章
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      // 定义 `variant` 属性，它有多种可能的值
      variant: {
        // 默认样式
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        // 次要样式
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        // 危险/错误样式
        destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        // 轮廓样式
        outline: 'text-foreground',
      },
    },
    // 默认使用的变体
    defaultVariants: {
      variant: 'default',
    },
  }
);

// 定义徽章组件的 props 类型接口
export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * Badge 组件：一个可定制样式的徽章。
 * @param {string} [className] - 自定义的 CSS 类名。
 * @param {string} [variant] - 徽章的样式变体 ('default', 'secondary', 'destructive', 'outline')。
 * @param {React.ReactNode} children - 徽章内部显示的内容。
 * @returns {JSX.Element} - 渲染后的徽章组件。
 */
function Badge({ className, variant, ...props }: BadgeProps) {
  // 使用 `cn` 工具函数合并基础样式、变体样式和自定义样式
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };