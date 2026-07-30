/**
 * AI 服务统一配置
 * 集中管理 LLM API Key、模型参数等
 */

export const AI_CONFIG = {
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    // 思维导图、问答等可换用更快的模型
    mindmapModel: process.env.DEEPSEEK_MINDMAP_MODEL || "deepseek-chat",
    summaryModel: process.env.DEEPSEEK_SUMMARY_MODEL || "deepseek-chat",
  },
  // 文本分块参数
  chunking: {
    maxChunkSize: 1500, // 每块最大字符数
    overlap: 200,       // 块间重叠字符
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
    maxContextChunks: 6, // 最多拼接的段落数
  },
};

export function isAIConfigured(): boolean {
  return Boolean(AI_CONFIG.deepseek.apiKey);
}
