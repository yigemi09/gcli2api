# package.json 中文注释说明

> 本文档详细解释 `package.json` 各字段的用途和含义，便于团队成员理解和维护。**实际配置请以无注释的 package.json 为准。**

---

## 文件用途
本文件用于定义 Node.js/TypeScript 项目的基本信息、依赖、脚本等，是 npm/yarn 工具识别和管理项目的核心配置文件。

---

## 字段说明

- **name**：项目名称，建议与仓库名一致。
- **version**：项目版本号，遵循语义化版本规范（如 1.0.0）。
- **description**：项目描述，简要说明用途。
- **main**：主入口文件（编译后 JS 文件路径）。
- **type**：指定模块类型为 ESM，支持 import/export。
- **scripts**：npm 脚本命令，常用于开发、构建、启动等。
  - `build`：编译 TypeScript 源码到 dist 目录。
  - `start`：启动编译后的服务。
  - `dev`：开发模式，监听编译并自动重启服务。
- **keywords**：关键词数组，便于 npm 搜索和分类。
- **author**：作者信息，可填写姓名或组织。
- **license**：许可证类型，默认 ISC。
- **dependencies**：生产依赖包列表（如 fastify）。
- **devDependencies**：开发依赖包列表（如 typescript、nodemon、@types/node）。

---

## 维护建议

- 不要在 package.json 文件内添加注释，否则 npm/yarn 工具无法识别。
- 如需说明，请在本 Markdown 文件补充。
- 依赖变更、脚本调整等建议同步更新本说明文档。