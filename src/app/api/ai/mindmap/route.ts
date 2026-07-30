/**
 * 文档思维导图 API（文件缓存版，零数据库侵入）
 * POST /api/ai/mindmap
 * body: { documentId: string, force?: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { parseDocument } from "@/lib/ai/document-parser";
import { chat } from "@/lib/ai/llm-client";
import { PROMPTS } from "@/lib/ai/prompts";
import { AI_CONFIG, isAIConfigured } from "@/lib/ai/config";
import { getCache, setCache, deleteCache } from "@/lib/ai/file-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface DocumentRow extends RowDataPacket {
  id: string;
  name: string;
  storage_key: string;
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await readSession(token) : null;
  if (!session) {
    return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  }

  if (!isAIConfigured()) {
    return NextResponse.json(
      { message: "AI 服务未配置（缺少 DEEPSEEK_API_KEY）。" },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { documentId, force = false } = body as { documentId?: string; force?: boolean };
  if (!documentId) {
    return NextResponse.json({ message: "参数错误：缺少 documentId。" }, { status: 400 });
  }

  const db = getDb();

  try {
    const [docs] = await db.query<DocumentRow[]>(
      `SELECT id, name, storage_key FROM documents WHERE id = ? LIMIT 1`,
      [documentId]
    );
    if (docs.length === 0) {
      return NextResponse.json({ message: "文档不存在。" }, { status: 404 });
    }
    const doc = docs[0];

    // 检查文件缓存
    if (!force) {
      const cached = getCache(documentId, "mindmap");
      if (cached) {
        return NextResponse.json({
          cached: true,
          markdown: cached.data.markdown,
          charCount: cached.data.charCount,
          updatedAt: cached.updatedAt,
        });
      }
    } else {
      deleteCache(documentId, "mindmap");
    }

    const parsed = await parseDocument(doc.storage_key);
    if (!parsed.text || parsed.text.length < 50) {
      return NextResponse.json(
        { message: "文档内容为空或太短，无法生成思维导图。" },
        { status: 400 }
      );
    }

    const truncated = parsed.text.slice(0, 8000);

    console.log(`[ai/mindmap] calling LLM for ${doc.id}`);
    const resp = await chat({
      messages: [
        { role: "system", content: PROMPTS.mindmap(doc.name) },
        { role: "user", content: truncated },
      ],
      temperature: AI_CONFIG.mindmap.temperature,
      maxTokens: AI_CONFIG.mindmap.maxTokens,
    });

    const markdown = resp.content.trim();
    if (!markdown.includes("#")) {
      return NextResponse.json(
        { message: "思维导图生成失败：模型输出格式异常。" },
        { status: 500 }
      );
    }

    // 保存到文件缓存
    setCache(documentId, "mindmap", {
      markdown,
      charCount: parsed.charCount,
    });

    return NextResponse.json({
      cached: false,
      markdown,
      charCount: parsed.charCount,
      usage: resp.usage,
    });
  } catch (err: any) {
    console.error("[ai/mindmap] error:", err);
    return NextResponse.json(
      { message: "生成思维导图失败", error: err?.message },
      { status: 500 }
    );
  }
}
