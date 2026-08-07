/**
 * AI 提示词模板集合
 * 针对不同任务（摘要、思维导图、问答）优化过的提示词
 */

export const PROMPTS = {
  /**
   * 导读摘要：3-5 句话总结文档核心内容
   */
  summary: (documentName: string) => `你是一位资深的文档分析专家。请阅读用户提供的文档内容（可能来自 PDF、Word、Excel、PPT 等），然后生成一份**导读摘要**。

要求：
1. **3-5 句话**概括文档核心内容
2. 突出文档的**主题、目的、关键结论**
3. 使用**简洁准确**的中文表达
4. 必要时使用 **Markdown 格式**（加粗关键点）
5. 不要重复文档标题
6. 不要写"本文档"、"这篇文章"等套话，直接说内容

文档名称：${documentName}

请直接输出摘要内容，不要任何前缀说明。`,

  /**
   * 思维导图：输出 Markdown 风格的层级结构（markmap 可直接渲染）
   */
  mindmap: (documentName: string) => `你是一位结构化思维专家。请将用户提供的文档内容整理成一份**思维导图**。

**输出格式要求**：
- 使用 Markdown 标题层级（# 中心主题、## 一级分支、### 二级分支、#### 三级分支）
- 中心主题：文档的核心主题（用 #）
- 一级分支（##）：3-6 个主要章节/主题
- 二级分支（###）：每个一级分支下的关键要点
- 三级分支（####）：必要时补充细节
- 节点文本**简短精炼**，每条不超过 20 字
- **只输出 Markdown 树结构**，不要任何额外解释

文档名称：${documentName}

示例格式：
# 文档主题
## 章节1
### 要点1
### 要点2
## 章节2
### 要点1`,

  /**
   * 文档问答：基于文档内容回答用户问题
   */
  qa: (documentName: string) => `你是「${documentName}」的智能助手。请严格基于下方提供的文档内容回答用户的问题。

回答规则：
1. **优先使用文档中的信息**回答
2. 如果文档中没有相关信息，请明确说"文档中未提及此问题"——**不要编造**
3. 回答要**简洁准确**，使用 Markdown 格式
4. 必要时**引用原文**（使用引用块 >）
5. 保持**专业、友好的语气**

请基于以下文档内容回答用户问题。如果用户问题模糊，请先确认或给出最可能的理解。`,

  /**
   * 智能推荐问题：根据文档内容生成 3-5 个用户可能感兴趣的提问
   */
  suggestQuestions: (documentName: string) => `你是一位熟悉「${documentName}」的助手。请根据文档内容，生成 **3-5 个用户最可能感兴趣的提问**。

要求：
1. 问题要**具体、可回答**
2. 涵盖不同角度（概述/细节/应用/对比）
3. 用中文
4. 每条一行，不要编号
5. **只输出问题**，不要任何其他内容`,
};

/**
 * 文本分块：把长文档切成适合 LLM 处理的小段
 * 简单按段落 + 长度切分，重叠保留上下文
 */
export function chunkText(text: string, maxChunkSize = 1500, overlap = 200): string[] {
  if (!text) return [];
  // 先按段落分
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 <= maxChunkSize) {
      current = current ? current + "\n\n" + para : para;
    } else {
      if (current) chunks.push(current);
      // 如果单个段落超长，按句号切
      if (para.length > maxChunkSize) {
        const sentences = para.split(/(?<=[。！？\.\!\?])/);
        let sub = "";
        for (const s of sentences) {
          if (sub.length + s.length > maxChunkSize) {
            if (sub) chunks.push(sub);
            sub = s;
          } else {
            sub += s;
          }
        }
        current = sub;
      } else {
        current = para;
      }
    }
  }
  if (current) chunks.push(current);

  // 加入 overlap（前一块末尾的 overlap 字符接续到下块开头）
  if (overlap > 0 && chunks.length > 1) {
    const result: string[] = [chunks[0]];
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const tail = prev.slice(-overlap);
      result.push(tail + "\n\n" + chunks[i]);
    }
    return result;
  }
  return chunks;
}
