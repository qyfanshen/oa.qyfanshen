/**
 * 文档导读摘要 API（文件缓存版，零数据库侵入）
 * POST /api/ai/summary
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
  // 1. 鉴权
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await readSession(token) : null;
  if (!session) {
    return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  }

  // 2. 检查 AI 配置
  if (!isAIConfigured()) {
    return NextResponse.json(
      { message: "AI 服务未配置（缺少 DEEPSEEK_API_KEY）。" },
      { status: 503 }
    );
  }

  // 3. 解析参数
  const body = await request.json().catch(() => ({}));
  const { documentId, force = false } = body as { documentId?: string; force?: boolean };
  if (!documentId) {
    return NextResponse.json({ message: "参数错误：缺少 documentId。" }, { status: 400 });
  }

  const db = getDb();

  try {
    // 4. 查文档（只读现有表）
    const [docs] = await db.query<DocumentRow[]>(
      `SELECT id, name, storage_key FROM documents WHERE id = ? LIMIT 1`,
      [documentId]
    );
    if (docs.length === 0) {
      return NextResponse.json({ message: "文档不存在。" }, { status: 404 });
    }
    const doc = docs[0];

    // 5. 检查文件缓存（除非 force=true）
    if (!force) {
      const cached = getCache(documentId, "summary");
      if (cached) {
        return NextResponse.json({
          cached: true,
          summary: cached.data.summary,
          charCount: cached.data.charCount,
          updatedAt: cached.updatedAt,
        });
      }
    } else {
      deleteCache(documentId, "summary");
    }

    // 6. 解析文档
    console.log(`[ai/summary] parsing document ${doc.id} (${doc.name})`);
    const parsed = await parseDocument(doc.storage_key);
    if (!parsed.text || parsed.text.length < 50) {
      return NextResponse.json(
        { message: "文档内容为空或太短，无法生成摘要。" },
        { status: 400 }
      );
    }

    // 7. 截取前 8000 字
    const truncated = parsed.text.slice(0, 8000);

    // 8. 调用 LLM
    console.log(`[ai/summary] calling LLM for ${doc.id}`);
    const resp = await chat({
      messages: [
        { role: "system", content: PROMPTS.summary(doc.name) },
        { role: "user", content: truncated },
      ],
      temperature: AI_CONFIG.summary.temperature,
      maxTokens: AI_CONFIG.summary.maxTokens,
    });

    // 9. 保存到文件缓存（不是数据库！）
    setCache(documentId, "summary", {
      summary: resp.content,
      charCount: parsed.charCount,
    });

    return NextResponse.json({
      cached: false,
      summary: resp.content,
      charCount: parsed.charCount,
      usage: resp.usage,
    });
  } catch (err: any) {
    console.error("[ai/summary] error:", err);
    return NextResponse.json(
      { message: "生成摘要失败", error: err?.message },
      { status: 500 }
    );
  }
}
