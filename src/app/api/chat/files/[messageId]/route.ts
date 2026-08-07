import { createReadStream, statSync } from "fs";
import path from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
const uploadDir = path.join(process.cwd(), "uploads", "chat");

const mimeMap: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".zip": "application/zip",
  ".rar": "application/x-rar-compressed",
  ".7z": "application/x-7z-compressed",
};

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return mimeMap[ext] || "application/octet-stream";
}

function encodeFilename(name: string): string {
  const encoded = encodeURIComponent(name).replace(/['()]/g, escape).replace(/\*/g, "%2A");
  return `filename*=UTF-8''${encoded}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  const { messageId } = await params;

  // 查消息及其会话成员权限
  const [rows] = await getDb().execute<any[]>(
    `SELECT m.id, m.conversation_id AS conversationId, m.file_name AS fileName, m.file_url AS fileUrl, m.type,
            c.type AS convType
     FROM chat_messages m
     JOIN chat_conversations c ON c.id = m.conversation_id
     WHERE m.id = ? LIMIT 1`,
    [messageId]
  );
  const msg = rows[0];
  if (!msg) return NextResponse.json({ message: "消息不存在" }, { status: 404 });

  // 权限检查：必须是会话成员
  const [memberRows] = await getDb().execute(
    "SELECT 1 FROM chat_conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1",
    [msg.conversationId, session.id]
  );
  if (!(memberRows as any[]).length) return NextResponse.json({ message: "无权访问" }, { status: 403 });

  const fileUrl: string = msg.fileUrl;
  if (!fileUrl) return NextResponse.json({ message: "文件不存在" }, { status: 404 });

  // fileUrl 格式: /uploads/chat/storageName.ext
  const storageName = fileUrl.replace("/uploads/chat/", "").replace(/^\//, "");
  if (storageName.includes("..") || storageName.includes("/") || storageName.includes("\\")) {
    return NextResponse.json({ message: "非法路径" }, { status: 400 });
  }

  const filePath = path.join(uploadDir, storageName);
  let fileStat;
  try {
    fileStat = statSync(filePath);
  } catch {
    return NextResponse.json({ message: "文件不存在或已被删除" }, { status: 404 });
  }

  const displayName = msg.fileName || storageName;
  const mime = getMimeType(displayName);
  const stream = createReadStream(filePath);
  const webStream = Readable.toWeb(stream) as ReadableStream;

  const isInline = request.nextUrl.searchParams.get("inline") === "1";
  const disposition = isInline ? "inline" : "attachment";

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(fileStat.size),
      "Content-Disposition": `${disposition}; ${encodeFilename(displayName)}`,
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
