// 本文件用于通过 Node.js 子进程调用本地 node_modules/.bin/gemini CLI，
// 并将其标准输出作为可读流返回，确保项目完全自包含，不依赖全局安装。
// 适用于所有需要与 Gemini CLI 交互的场景。

import { spawn } from 'child_process';
import { Readable } from 'stream';
import { broadcastLog } from './server.js'; // 导入日志广播函数
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录名（兼容 ES 模块）
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 构建本地 gemini 可执行文件的绝对路径，确保调用的是项目依赖
const geminiExecutablePath = path.resolve(
  __dirname,
  '..', // dist-server
  'node_modules',
  '@google',
  'gemini-cli',
  'bundle',
  'gemini.js'
);

/**
 * 调用 Gemini CLI 子进程并处理输入/输出。
 * @param prompt 要发送给 Gemini CLI 的字符串提示。
 * @param model 可选的模型参数。
 * @returns 返回一个包含子进程 stdout 和 stderr 的对象。
 * @throws 如果 prompt 参数不是字符串，则抛出 TypeError。
 */
export function invokeGeminiCli(
  prompt: string,
  model?: string,
): { stdout: Readable; stderr: Readable } {
  broadcastLog('info', `[CLI-Runner] invokeGeminiCli 函数已进入。`);
  broadcastLog('info', `[CLI-Runner] 接收到的 prompt (前100字符): ${prompt.substring(0, 100)}...`);
  broadcastLog('info', `[CLI-Runner] 接收到的 model: ${model || '默认'}`);

  if (typeof prompt !== 'string') {
    broadcastLog('error', `[CLI-Runner] prompt 参数类型错误: ${typeof prompt}`);
    throw new TypeError('prompt 参数必须为字符串');
  }

  const args: string[] = [];
  if (model) {
    args.push('--model', model);
  }

  const geminiExecutablePath = path.resolve(
    __dirname,
    '..', // dist-server
    'node_modules',
    '@google',
    'gemini-cli',
    'bundle',
    'gemini.js'
  );

  broadcastLog('info', `[CLI-Runner] 正在启动 gemini CLI 子进程...`);
  broadcastLog('info', `[CLI-Runner] 命令: node ${geminiExecutablePath}`);
  broadcastLog('info', `[CLI-Runner] 参数: ${JSON.stringify(args)}`);

  const geminiProcess = spawn('node', [geminiExecutablePath, ...args], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // 将 prompt 写入子进程的 stdin
  geminiProcess.stdin.write(prompt);
  geminiProcess.stdin.end();

  broadcastLog('info', `[invokeGeminiCli] 子进程已启动。PID: ${geminiProcess.pid}`);

  // geminiProcess.stdout.on('data', (data) => {
  //   const message = data.toString();
  //   broadcastLog('data', `[Gemini CLI stdout]: ${message}`);
  // });

  geminiProcess.stderr.on('data', (data) => {
    const message = data.toString();
    broadcastLog('error', `[Gemini CLI stderr]: ${message}`);
  });

  geminiProcess.on('error', (err) => {
    broadcastLog('error', `[invokeGeminiCli] Gemini CLI 子进程启动失败或运行时错误: ${err.message}`);
  });

  geminiProcess.on('exit', (code, signal) => {
    if (code !== 0) {
      broadcastLog('error', `[CLI-Runner] Gemini CLI 子进程退出，退出码: ${code}, 信号: ${signal || '无'}`);
    } else {
      broadcastLog('info', `[CLI-Runner] Gemini CLI 子进程正常退出，退出码: ${code}`);
    }
  });

  geminiProcess.on('close', (code) => {
    broadcastLog('info', `[CLI-Runner] Gemini CLI 子进程所有stdio流已关闭，退出码: ${code}`);
  });

  broadcastLog('info', `[CLI-Runner] 返回子进程流。`);
  return { stdout: geminiProcess.stdout, stderr: geminiProcess.stderr };
}