/**
 * 文档 AI 提问 API（流式，零数据库侵入）
 * POST /api/ai/chat
 * body: { documentId: string, question: string }
 * 对话历史存在内存（重启丢失，可扩展为文件存储）
 */

import { NextRequest } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { parseDocument } from "@/lib/ai/document-parser";
import { chatStream } from "@/lib/ai/llm-client";
import { PROMPTS, chunkText } from "@/lib/ai/prompts";
import { AI_CONFIG, isAIConfigured } from "@/lib/ai/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface DocumentRow extends RowDataPacket {
  id: string;
  name: string;
  storage_key: string;
}

// 简单的内存对话历史（零数据库，重启丢失）
// 如需持久化，可改用文件存储
const conversationMemory = new Map<string, Array<{ role: "user" | "assistant"; content: string }>>();

function getConversationKey(userId: string, documentId: string): string {
  return `${userId}:${documentId}`;
}

function selectRelevantChunks(question: string, chunks: string[], maxChunks = 6): string[] {
  const keywords = question
    .toLowerCase()
    .split(/[\s,。、?!；：'"()（）【】\[\]<>《》\.\,\?\/]+/)
    .filter((w) => w.length >= 2);

  if (keywords.length === 0) {
    return chunks.slice(0, maxChunks);
  }

  const scored = chunks.map((chunk, idx) => {
    const lower = chunk.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      const matches = lower.split(kw).length - 1;
      score += matches * kw.length;
    }
    if (chunk.length < 100) score *= 0.5;
    return { idx, score, chunk };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxChunks).map((s) => s.chunk);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await readSession(token) : null;
  if (!session) {
    return new Response(JSON.stringify({ message: "请先登录。" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!isAIConfigured()) {
    return new Response(JSON.stringify({ message: "AI 服务未配置。" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json().catch(() => ({}));
  const { documentId, question } = body as {
    documentId?: string;
    question?: string;
  };
  if (!documentId || !question) {
    return new Response(JSON.stringify({ message: "参数错误。" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getDb();

  try {
    const [docs] = await db.query<DocumentRow[]>(
      `SELECT id, name, storage_key FROM documents WHERE id = ? LIMIT 1`,
      [documentId]
    );
    if (docs.length === 0) {
      return new Response(JSON.stringify({ message: "文档不存在。" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const doc = docs[0];

    console.log(`[ai/chat] parsing document ${doc.id}`);
    const parsed = await parseDocument(doc.storage_key);
    const chunks = chunkText(parsed.text, AI_CONFIG.chunking.maxChunkSize, AI_CONFIG.chunking.overlap);

    const relevant = selectRelevantChunks(question, chunks, AI_CONFIG.chat.maxContextChunks);
    const context = relevant.join("\n\n---\n\n");

    // 获取对话历史（内存）
    const convKey = getConversationKey(String(session.id), documentId);
    const history = conversationMemory.get(convKey) || [];

    // 保存用户消息
    history.push({ role: "user", content: question });

    const messages = [
      { role: "system" as const, content: PROMPTS.qa(doc.name) },
      {
        role: "system" as const,
        content: `以下是「${doc.name}」的相关内容片段：\n\n${context}`,
      },
      ...history.slice(-10).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: question },
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullAnswer = "";
        try {
          for await (const delta of chatStream({
            messages,
            model: AI_CONFIG.llm.model,
            temperature: AI_CONFIG.chat.temperature,
            maxTokens: AI_CONFIG.chat.maxTokens,
          })) {
            fullAnswer += delta;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ content: delta })}\n\n`)
            );
          }
          // 保存 AI 回答到内存
          history.push({ role: "assistant", content: fullAnswer });
          conversationMemory.set(convKey, history);

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ done: true, fullAnswer })}\n\n`
            )
          );
          controller.close();
        } catch (err: any) {
          console.error("[ai/chat] stream error:", err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: err?.message || "生成失败" })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err: any) {
    console.error("[ai/chat] error:", err);
    return new Response(
      JSON.stringify({ message: "提问失败", error: err?.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
