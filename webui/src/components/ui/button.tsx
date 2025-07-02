{
  /*
   * @file: gemini-openai-proxy/webui/src/components/ui/button.tsx
   * @purpose: 定义一个通用的、可定制样式的按钮组件。
   */
}
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// 使用 class-variance-authority (cva) 定义按钮的样式变体
const buttonVariants = cva(
  // 基础样式：所有按钮共有的样式
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      // `variant` 属性定义了按钮的主要外观
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      // `size` 属性定义了按钮的尺寸
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    // 默认应用的变体
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

// 定义按钮组件的 props 类型接口
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean; // 如果为 true，则将 props 传递给子组件而不是渲染一个 <button>
}

// Button 组件定义
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    // 如果 `asChild` 为 true，则使用 `Slot` 组件将 props 和 ref 传递给直接子元素。
    // 这允许我们将按钮的样式和行为应用到任何子组件上，例如一个 `<a>` 标签。
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };