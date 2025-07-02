{
  /*
   * @file: gemini-openai-proxy/webui/src/lib/utils.ts
   * @purpose: 提供一个工具函数 `cn`，用于合并和优化 Tailwind CSS 类名。
   */
}
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 合并多个 CSS 类名，并解决 Tailwind CSS 的样式冲突。
 * @param inputs - 一个或多个类名字符串、对象或数组。
 * @returns {string} - 合并后的单个类名字符串。
 */
export function cn(...inputs: ClassValue[]): string {
  // `clsx` 用于将多种形式的类名输入（字符串、对象、数组）转换为一个字符串。
  // `twMerge` 用于合并 Tailwind CSS 类名，并智能地处理冲突（例如，`p-2` 和 `p-4` 同时存在时，后者会覆盖前者）。
  return twMerge(clsx(inputs));
}