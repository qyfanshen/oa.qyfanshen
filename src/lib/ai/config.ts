/**
 * AI 服务统一配置
 * 支持 DeepSeek 官方 API 和火山引擎方舟 API
 * 通过环境变量 LLM_PROVIDER 选择：deepseek | ark
 */

const provider = process.env.LLM_PROVIDER || "ark";

const arkConfig = {
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  baseUrl: process.env.LLM_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
  model: process.env.LLM_MODEL || "doubao-pro-32k",
  mindmapModel: process.env.LLM_MINDMAP_MODEL || "doubao-pro-32k",
  summaryModel: process.env.LLM_SUMMARY_MODEL || "doubao-pro-32k",
};

const deepseekConfig = {
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  baseUrl: process.env.LLM_BASE_URL || "https://api.deepseek.com",
  model: process.env.LLM_MODEL || "deepseek-chat",
  mindmapModel: process.env.LLM_MINDMAP_MODEL || "deepseek-chat",
  summaryModel: process.env.LLM_SUMMARY_MODEL || "deepseek-chat",
};

export const AI_CONFIG = {
  provider,
  llm: provider === "ark" ? arkConfig : deepseekConfig,
  // 文本分块参数
  chunking: {
    maxChunkSize: 1500,
    overlap: 200,
  },
  // 摘要参数
  summary: {
    maxTokens: 800,
    temperature: 0.3,
  },
  // 思维导图参数
  mindmap: {
    maxTokens: 2000,
    temperature: 0.2,
  },
  // 问答参数
  chat: {
    maxTokens: 2000,
    temperature: 0.5,
    maxContextChunks: 6,
  },
};

export function isAIConfigured(): boolean {
  const demoMode = process.env.AI_DEMO_MODE === "true" || process.env.AI_DEMO_MODE === "1";
  return demoMode || Boolean(AI_CONFIG.llm.apiKey);
}
