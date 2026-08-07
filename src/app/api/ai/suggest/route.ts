/**
 * 智能推荐问题 API（文件缓存版，零数据库侵入）
 * POST /api/ai/suggest
 * body: { documentId: string }
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
export const maxDuration = 60;

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
    return NextResponse.json({ message: "AI 服务未配置。" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const { documentId, force = false } = body as { documentId?: string; force?: boolean };
  if (!documentId) {
    return NextResponse.json({ message: "参数错误。" }, { status: 400 });
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
      const cached = getCache(documentId, "suggest");
      if (cached) {
        return NextResponse.json({
          cached: true,
          questions: cached.data.questions,
        });
      }
    } else {
      deleteCache(documentId, "suggest");
    }

    const parsed = await parseDocument(doc.storage_key);
    if (!parsed.text || parsed.text.length < 50) {
      return NextResponse.json({ message: "文档内容太短。" }, { status: 400 });
    }

    const truncated = parsed.text.slice(0, 6000);

    const resp = await chat({
      messages: [
        { role: "system", content: PROMPTS.suggestQuestions(doc.name) },
        { role: "user", content: truncated },
      ],
      temperature: 0.7,
      maxTokens: 500,
    });

    const questions = resp.content
      .split("\n")
      .map((line) => line.replace(/^[\d\.\-\*\s]+/, "").trim())
      .filter((line) => line.length > 0 && line.length < 200)
      .slice(0, 5);

    // 保存到文件缓存
    setCache(documentId, "suggest", { questions });

    return NextResponse.json({ cached: false, questions });
  } catch (err: any) {
    console.error("[ai/suggest] error:", err);
    return NextResponse.json(
      { message: "生成推荐问题失败", error: err?.message },
      { status: 500 }
    );
  }
}
