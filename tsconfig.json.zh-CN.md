# tsconfig.json 中文注释说明

> 本文档详细解释 `tsconfig.json` 各字段的用途和含义，便于团队成员理解和维护。**实际配置请以无注释的 tsconfig.json 为准。**

---

## 文件用途
本文件用于配置 TypeScript 编译器行为，包括输入输出目录、语法特性、类型检查等，是 TypeScript 项目开发的核心配置文件。

---

## 字段说明

- **compilerOptions**：编译选项对象，控制 TypeScript 编译器的各种行为。
  - `target`：指定 ECMAScript 目标版本（如 ES2022），决定编译输出 JS 的语法标准。
  - `module`：指定模块系统（如 NodeNext），适配 Node.js 的 ESM 方案。
  - `moduleResolution`：指定模块解析方式，NodeNext 支持 ESM 与 CommonJS 混用。
  - `outDir`：编译输出目录，所有编译后的 JS 文件会放在 dist 目录下。
  - `rootDir`：源码根目录，TypeScript 只会编译 src 目录下的文件。
  - `strict`：启用所有严格类型检查选项，提升代码健壮性。
  - `esModuleInterop`：允许默认导入非 ESModule 模块，提升兼容性。
  - `skipLibCheck`：跳过库文件类型检查，加快编译速度。
  - `forceConsistentCasingInFileNames`：强制文件名大小写一致，避免跨平台问题。
- **include**：指定需要编译的文件范围，这里包含 src 目录下所有文件。
- **exclude**：排除 node_modules 目录，避免编译第三方依赖。

---

## 维护建议

- 不要在 tsconfig.json 文件内添加注释，否则 tsc 工具无法识别。
- 如需说明，请在本 Markdown 文件补充。
- 配置变更建议同步更新本说明文档。