/**
 * @file gemini-provider.ts
 * @description 该文件定义了 GeminiCliProvider 类，负责处理与 Google Gemini API 的所有交互。
 * 主要功能包括：
 * 1. 通过 google-auth-library 管理 OAuth2.0 认证流程。
 * 2. 从本地文件系统（~/.gemini/oauth_creds.json）加载、持久化和刷新用户凭证。
 * 3. 封装向 Gemini Code Assist API (streamGenerateContent) 发送请求的逻辑。
 * 4. 解析 API 返回的 Server-Sent Events (SSE) 流。
 * 5. 以单例模式导出，供整个应用统一调用。
 */
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { OAuth2Client } from 'google-auth-library';
import { broadcastLog } from './server.js';
// --- 常量定义 ---
/**
 * OAuth 2.0 客户端ID。
 * @description 这是用于识别应用身份的公共ID。
 * @note 这是一个占位符，在实际部署时应替换为真实的客户端ID。
 */
const OAUTH_CLIENT_ID = '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';
/**
 * OAuth 2.0 客户端密钥。
 * @description 这是与客户端ID配对的密钥，用于认证应用。
 * @note 这是一个占位符，在实际部署时应替换为真实的客户端密钥，并妥善保管。
 */
const OAUTH_CLIENT_SECRET = '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';
/**
 * Gemini Code Assist API 的基础端点。
 */
const CODE_ASSIST_ENDPOINT = 'https://cloudcode-pa.googleapis.com';
/**
 * @class GeminiCliProvider
 * @description 封装了与 Gemini API 交互的所有逻辑，包括认证和API调用。
 */
class GeminiCliProvider {
    authClient;
    credentialsPath;
    projectId;
    /**
     * @constructor
     * 初始化 OAuth2 客户端和凭证存储路径。
     */
    constructor() {
        this.authClient = new OAuth2Client(OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET);
        this.credentialsPath = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
    }
    /**
     * 从本地文件加载凭证并设置到 OAuth2 客户端。
     * @returns {Promise<boolean>} 如果成功加载和设置凭证，则返回 true，否则返回 false。
     */
    async loadCredentials() {
        try {
            // 确保凭证目录存在，如果不存在则递归创建。
            await fs.mkdir(path.dirname(this.credentialsPath), { recursive: true });
            const content = await fs.readFile(this.credentialsPath, 'utf-8');
            const credentials = JSON.parse(content);
            // 必须要有 refresh_token 才能进行后续的自动刷新
            if (!credentials.refresh_token) {
                broadcastLog('error', '凭证文件中缺少 refresh_token，请重新认证。');
                return false;
            }
            this.authClient.setCredentials(credentials);
            return true;
        }
        catch (error) {
            // 文件不存在或解析失败都是预期的错误（例如首次运行或文件损坏）。
            // 对 `unknown` 类型的错误进行安全的属性访问以修复ts(18046)错误。
            if (error instanceof Error && 'code' in error) {
                // 如果错误是文件系统错误，但不是“文件未找到”，则记录它。
                if (error.code !== 'ENOENT') {
                    broadcastLog('error', `加载凭证文件失败: ${error.message}`);
                }
            }
            else {
                // 捕获并记录非标准的或非对象的错误。
                broadcastLog('error', `加载凭证时发生未知类型的错误: ${error}`);
            }
            return false;
        }
    }
    /**
     * 确保认证状态有效。如果 access_token 即将过期，则自动刷新。
     * @throws {Error} 如果刷新 token 失败，则抛出错误。
     */
    async ensureAuthenticated() {
        // 如果内存中没有凭证，则先从文件加载
        if (!this.authClient.credentials.access_token) {
            const loaded = await this.loadCredentials();
            // 如果加载失败，说明需要用户进行认证
            if (!loaded) {
                throw new Error('未找到有效的用户凭证，请先运行认证流程。');
            }
        }
        // 检查 access_token 的有效期，留出 60 秒的缓冲时间
        const expiryDate = this.authClient.credentials.expiry_date;
        if (expiryDate && expiryDate <= (Date.now() + 60 * 1000)) {
            broadcastLog('info', 'Access token 即将过期或已过期，正在刷新...');
            try {
                await this.authClient.refreshAccessToken();
                // **关键步骤**: 将刷新后的新凭证（包含新的 access_token 和有效期）写回文件
                await fs.writeFile(this.credentialsPath, JSON.stringify(this.authClient.credentials, null, 2), 'utf-8');
                broadcastLog('info', '凭证已成功刷新并保存。');
            }
            catch (error) {
                broadcastLog('error', `刷新认证 token 失败: ${error}`);
                throw new Error('无法刷新认证 token，可能需要重新认证。');
            }
        }
        // 在所有认证检查和刷新都成功完成后，预先获取项目ID。
        // 这可以确保后续的API调用不会因为首次发现项目ID而产生延迟。
        if (this.authClient.credentials.access_token) {
            try {
                await this.discoverProjectId();
                broadcastLog('info', '项目ID已成功预热。');
            }
            catch (error) {
                broadcastLog('error', `预热项目ID时失败: ${error.message}`);
                // 此处不应抛出错误，因为这只是一个预热/优化步骤。
                // 真正的错误将在 createMessage 中实际调用 discoverProjectId 时被捕获。
            }
        }
    }
    /**
     * @private
     * @name callEndpoint
     * @description 向CODE_ASSIST_ENDPOINT发送通用POST请求的辅助方法。
     * @param {string} method - API端点的方法名 (例如, 'loadCodeAssist', 'onboardUser').
     * @param {any} body - 请求体对象.
     * @returns {Promise<any>} - 从API返回的JSON响应数据.
     * @throws {Error} - 如果API调用失败，则抛出错误.
     */
    async callEndpoint(method, body) {
        const url = `${CODE_ASSIST_ENDPOINT}/v1internal:${method}`;
        try {
            const response = await this.authClient.request({
                url: url,
                method: 'POST',
                data: JSON.stringify(body),
                responseType: 'json',
            });
            return response.data;
        }
        catch (error) {
            broadcastLog('error', `调用 ${method} 端点失败: ${error}`);
            throw new Error(`API调用失败: ${method}。错误信息: ${error.message}`);
        }
    }
    /**
     * @public
     * @name discoverProjectId
     * @description 动态发现或创建与用户关联的Google Cloud项目ID。
     *              完整实现了从加载、到按需创建、再到轮询长时间操作的完整流程。
     * @returns {Promise<string>} - 返回有效的GCP项目ID.
     */
    async discoverProjectId() {
        // 1. 检查缓存中是否已有项目ID，如有则直接返回。
        if (this.projectId) {
            return this.projectId;
        }
        // 2. 定义用于API请求的客户端元数据。
        const clientMetadata = {
            ideType: "IDE_UNSPECIFIED",
            platform: "PLATFORM_UNSPECIFIED",
            pluginType: "GEMINI",
            duetProject: "default", // 使用初始占位符
        };
        try {
            // 3. 调用 loadCodeAssist 尝试获取已存在的项目ID。
            const loadRequest = {
                cloudaicompanionProject: "default",
                metadata: clientMetadata,
            };
            const loadResponse = await this.callEndpoint("loadCodeAssist", loadRequest);
            // 4. 如果响应中直接包含项目ID，则存储并返回。
            if (loadResponse.cloudaicompanionProject) {
                this.projectId = loadResponse.cloudaicompanionProject;
                broadcastLog('info', `发现已存在的项目ID: ${this.projectId}`);
                return this.projectId;
            }
            // 5. 如果没有项目ID，则启动用户引导（Onboarding）流程。
            broadcastLog('info', '未发现项目ID，开始新的用户引导流程...');
            const onboardRequest = {
                tierId: loadResponse.allowedTiers?.find((t) => t.isDefault)?.id || "free-tier",
                cloudaicompanionProject: "default",
                metadata: clientMetadata,
            };
            let lroResponse = await this.callEndpoint("onboardUser", onboardRequest);
            // 6. 实现轮询逻辑来等待长时间运行的操作（LRO）完成。
            const MAX_RETRIES = 30; // 最多重试30次（总计约60秒）
            let retryCount = 0;
            broadcastLog('info', '正在轮询用户引导操作状态...');
            while (!lroResponse.done && retryCount < MAX_RETRIES) {
                retryCount++;
                broadcastLog('info', `轮询 #${retryCount}...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                lroResponse = await this.callEndpoint("onboardUser", onboardRequest);
            }
            // 7. 检查轮询结果。
            if (!lroResponse.done) {
                throw new Error("用户引导操作超时。");
            }
            // 8. 从完成的LRO响应中提取最终的项目ID。
            const discoveredId = lroResponse.response?.cloudaicompanionProject?.id;
            if (!discoveredId) {
                throw new Error("用户引导操作成功，但未能从响应中提取项目ID。");
            }
            this.projectId = discoveredId;
            broadcastLog('info', `新项目ID已成功创建并获取: ${this.projectId}`);
            return this.projectId;
        }
        catch (error) {
            broadcastLog('error', `发现项目ID的过程中发生严重错误: ${error.message}`);
            throw new Error(`无法发现或创建GCP项目ID。请检查您的网络连接和Google Cloud认证状态。原始错误: ${error.message}`);
        }
    }
    /**
     * @description 创建并流式传输一条消息。
     * 该方法接收一个OpenAI格式的消息数组，将其转换为Gemini后端API所需的格式，然后发送请求。
     * @param messages - OpenAI格式的消息数组，例如 [{ role: 'user', content: '你好' }]
     * @param modelId - 使用的模型ID，例如 'gemini-1.5-pro-001'
     * @returns {Promise<import('axios').AxiosResponse<Readable>>} 直接返回包含流式数据的 Axios 响应。
     */
    /**
     * @description 创建并流式传输一条消息。
     * 该方法接收一个OpenAI格式的消息数组，将其转换为Gemini后端API所需的格式，然后发送请求。
     * @param messages - OpenAI格式的消息数组，例如 [{ role: 'user', content: '你好' }]
     * @param modelId - 使用的模型ID，例如 'gemini-1.5-pro-001'
     * @returns {Promise<import('axios').AxiosResponse<Readable>>} 直接返回包含流式数据的 Axios 响应。
     */
    /**
     * @description 创建并流式传输一条消息。
     * 该方法接收一个OpenAI格式的消息数组，将其转换为Gemini后端API所需的格式，然后发送请求。
     * @param messages - OpenAI格式的消息数组，例如 [{ role: 'user', content: '你好' }]
     * @param modelId - 使用的模型ID，例如 'gemini-1.5-pro-001'
     * @returns {Promise<import('axios').AxiosResponse<Readable>>} 直接返回包含流式数据的 Axios 响应。
     */
    /**
     * @description 创建并流式传输一条消息。
     * 该方法接收一个OpenAI格式的消息数组，将其转换为Gemini后端API所需的格式，然后发送请求。
     * @param messages - OpenAI格式的消息数组，例如 [{ role: 'user', content: '你好' }]
     * @param modelId - 使用的模型ID，例如 'gemini-1.5-pro-001'
     * @param systemInstruction - 由上层传递的系统指令字符串，作为首条 user 消息（可选，默认为空字符串）
     * @returns {Promise<import('axios').AxiosResponse<Readable>>} 直接返回包含流式数据的 Axios 响应。
     */
    async createMessage(messages, modelId = 'gemini-1.5-pro-001', systemInstruction = '') {
        // 1. 确保在进行任何API调用之前，认证状态都是有效的。
        await this.ensureAuthenticated();
        const projectId = await this.discoverProjectId();
        // 2. 构建 contents 数组
        //   - 如果 systemInstruction 非空，则作为首条 user 消息
        //   - 仅处理 role 为 'user' 或 'assistant' 的消息，'assistant' 映射为 'model'
        const contents = [];
        if (systemInstruction) {
            contents.push({ role: 'user', parts: [{ text: systemInstruction }] });
        }
        for (const msg of messages) {
            if (msg.role === 'user') {
                contents.push({ role: 'user', parts: [{ text: msg.content }] });
            }
            else if (msg.role === 'assistant') {
                contents.push({ role: 'model', parts: [{ text: msg.content }] });
            }
            // 其他角色（如 'system'）直接忽略
        }
        // 3. 日志输出 contents
        broadcastLog('debug', `[GeminiProvider] 构造的 contents: ${JSON.stringify(contents, null, 2)}`);
        // 4. 如果有 systemInstruction，输出日志（截断100字符，避免日志过长）
        if (systemInstruction) {
            const truncated = systemInstruction.length > 100
                ? systemInstruction.substring(0, 100) + '...'
                : systemInstruction;
            broadcastLog('debug', `[GeminiProvider] 接收到的 systemInstruction: ${truncated}`);
        }
        // 5. 构建请求体，确保无 systemInstruction 字段
        // 类型声明为 any，避免类型报错
        const requestBody = {
            model: modelId,
            project: projectId,
            request: {
                contents: contents,
                generationConfig: {
                    maxOutputTokens: 8192,
                    temperature: 0.9,
                    topP: 1,
                },
                safetySettings: [
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
                ],
            },
        };
        // 6. 构建指向新版API端点的URL。
        const url = `${CODE_ASSIST_ENDPOINT}/v1internal:streamGenerateContent`;
        // 7. 发送POST请求，并设置`responseType`为`stream`来处理流式响应。
        const response = await this.authClient.request({
            url,
            method: 'POST',
            params: { alt: 'sse' },
            data: JSON.stringify(requestBody),
            responseType: 'stream',
        });
        // 8. 直接返回Axios的响应对象，让调用者处理数据流。
        return response;
    }
}
/**
 * `GeminiCliProvider` 的单例实例。
 * 在整个应用程序中，应该只使用这个实例来与 Gemini API 进行交互，
 * 以确保认证状态和凭证的一致性。
 */
export const geminiProvider = new GeminiCliProvider();
