// 本文件用于通过 Node.js 子进程调用本地 node_modules/.bin/gemini CLI，
// 并将其标准输出作为可读流返回，确保项目完全自包含，不依赖全局安装。
// 适用于所有需要与 Gemini CLI 交互的场景。
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
// 获取当前文件的目录名（兼容 ES 模块）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 构建本地 gemini 可执行文件的绝对路径，确保调用的是项目依赖
const geminiExecutablePath = path.resolve(__dirname, '..', // 返回到项目根目录
'node_modules', '.bin', 'gemini');
/**
 * 调用本地 Gemini CLI 子进程并处理输入/输出。
 * @param prompt 要发送给 Gemini CLI 的字符串提示。
 * @returns 返回一个包含子进程 stdout 的可读流。
 * @throws 如果子进程启动失败或发生 I/O 错误，将通过 stderr 输出错误日志。
 */
export function invokeGeminiCli(prompt) {
    // 类型校验，确保 prompt 为字符串
    if (typeof prompt !== 'string') {
        throw new TypeError('prompt 参数必须为字符串');
    }
    // 使用 spawn 启动子进程，直接指定本地 gemini 可执行文件路径
    const geminiProcess = spawn(geminiExecutablePath, {
        stdio: ['pipe', 'pipe', 'pipe'], // 分别为 stdin, stdout, stderr 创建管道
    });
    // 将 prompt 写入子进程的 stdin
    geminiProcess.stdin.write(prompt);
    // 关闭 stdin 流，告知子进程输入结束
    geminiProcess.stdin.end();
    // 监听 stderr，捕获并输出任何错误信息
    geminiProcess.stderr.on('data', (data) => {
        // 这里直接输出到主进程的标准错误
        console.error(`Gemini CLI Error: ${data.toString()}`);
    });
    // 返回子进程的 stdout 作为可读流，供上层消费
    return geminiProcess.stdout;
}
