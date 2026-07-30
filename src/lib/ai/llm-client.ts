/**
 * 统一的 LLM 调用客户端
 * 当前只支持 DeepSeek（OpenAI 兼容协议）
 *
 * 演示模式：当环境变量 AI_DEMO_MODE=true 时，不调真实 LLM
 *   基于文档内容片段返回合理的模拟输出（用于没钱/无 Key 时演示 UI）
 */

import { AI_CONFIG } from "./config";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 检测是否演示模式
 */
function isDemoMode(): boolean {
  return process.env.AI_DEMO_MODE === "true" || process.env.AI_DEMO_MODE === "1";
}

/**
 * 提取用户消息内容
 */
function extractUserContent(messages: ChatMessage[]): string {
  const userMsg = messages.findLast?.((m) => m.role === "user");
  if (userMsg) return userMsg.content;
  // 降级：取最后一个 user 消息
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return "";
}

/**
 * 提取 system 提示词（判断要生成什么）
 */
function detectTask(messages: ChatMessage[]): "summary" | "mindmap" | "qa" | "suggest" | "unknown" {
  const sysContent = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n")
    .toLowerCase();
  if (sysContent.includes("导读摘要") || sysContent.includes("摘要")) return "summary";
  if (sysContent.includes("思维导图") || sysContent.includes("markdown 树")) return "mindmap";
  if (sysContent.includes("推荐问题") || sysContent.includes("用户可能问")) return "suggest";
  if (sysContent.includes("基于以下文档内容") || sysContent.includes("qa")) return "qa";
  return "unknown";
}

/**
 * 生成演示模式输出
 * 从用户消息中提取文档片段，构造合理回复
 */
function generateDemoResponse(req: ChatRequest): string {
  const task = detectTask(req.messages);
  const userContent = extractUserContent(req.messages);
  const preview = userContent.slice(0, 300).replace(/\n+/g, " ").trim();
  const hasContent = preview.length > 20;

  switch (task) {
    case "summary": {
      if (!hasContent) {
        return `## 文档摘要\n\n该文档暂无足够内容生成摘要。请确认文档可正常解析。`;
      }
      return `## 摘要（演示模式）

**文档概览**：${preview.slice(0, 80)}...

**核心要点**：
- 该文档主要围绕上述主题展开论述
- 内容结构清晰，涵盖核心场景与关键指标
- 建议结合实际业务场景进一步分析

> ⚠️ 当前为演示模式输出（AI_DEMO_MODE=true）。\n> 启用真实 AI：在 .env.local 中删除 AI_DEMO_MODE 并配置 DEEPSEEK_API_KEY 且账户有余额。`;
    }
    case "mindmap": {
      if (!hasContent) {
        return `# 思维导图\n\n## 文档内容\n- 暂无内容`;
      }
      return `# ${preview.slice(0, 30)} 思维导图

## 核心主题
- 文档概述
  - 背景介绍
  - 涉及范围
- 关键内容
  - 重要结论
  - 数据指标
- 应用场景
  - 业务价值
  - 实施建议

> ⚠️ 演示模式（AI_DEMO_MODE=true）。真实 AI：删除该变量并确保 DeepSeek 账户有余额。`;
    }
    case "suggest": {
      return [
        "1. 这份文档的核心内容是什么？",
        "2. 文档中提到的关键数据有哪些？",
        "3. 文档涉及哪些主要场景？",
        "4. 如何应用文档中的方案？",
        "5. 文档有哪些重要的结论？",
      ].join("\n");
    }
    case "qa":
    default: {
      if (!hasContent) {
        return `【演示模式】抱歉，无法获取到足够文档内容来回答问题。\n\n请确保：\n1. 文档可正常解析（检查文件格式）\n2. 启用真实 AI：删除 .env.local 中的 AI_DEMO_MODE 并配置 DEEPSEEK_API_KEY`;
      }
      return `【演示模式回答】

根据文档《${preview.slice(0, 40)}...》的相关内容：

您的提问已收到。由于当前 AI_DEMO_MODE=true，返回的是演示数据。

要获得基于文档的智能回答，请：
1. 前往 https://platform.deepseek.com 充值账户
2. 或在 .env.local 中删除 AI_DEMO_MODE=true
3. 重新加载页面

> 当前演示模式让您能完整体验 UI 与交互流程。`;
    }
  }
}

/**
 * 非流式调用 LLM
 */
export async function chat(request: ChatRequest): Promise<ChatResponse> {
  if (isDemoMode()) {
    return {
      content: generateDemoResponse(request),
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }

  const { deepseek } = AI_CONFIG;
  if (!deepseek.apiKey) {
    throw new Error("DEEPSEEK_API_KEY 未配置");
  }

  const resp = await fetch(`${deepseek.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deepseek.apiKey}`,
    },
    body: JSON.stringify({
      model: deepseek.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.5,
      max_tokens: request.maxTokens ?? 2000,
      stream: false,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`DeepSeek API 错误 ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  return {
    content: data.choices?.[0]?.message?.content || "",
    usage: data.usage,
  };
}

/**
 * 流式调用 LLM
 * 返回 AsyncIterable<string>，每段是模型输出的增量文本
 */
export async function* chatStream(request: ChatRequest): AsyncGenerator<string, void, void> {
  if (isDemoMode()) {
    const fullText = generateDemoResponse(request);
    // 按字流式输出，模拟真实打字效果
    for (let i = 0; i < fullText.length; i += 3) {
      yield fullText.slice(i, i + 3);
      await new Promise((r) => setTimeout(r, 20));
    }
    return;
  }

  const { deepseek } = AI_CONFIG;
  if (!deepseek.apiKey) {
    throw new Error("DEEPSEEK_API_KEY 未配置");
  }

  const resp = await fetch(`${deepseek.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deepseek.apiKey}`,
    },
    body: JSON.stringify({
      model: deepseek.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.5,
      max_tokens: request.maxTokens ?? 2000,
      stream: true,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`DeepSeek API 错误 ${resp.status}: ${errText}`);
  }
  if (!resp.body) {
    throw new Error("流式响应为空");
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // 忽略解析错误
      }
    }
  }
}
