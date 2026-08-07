import { createReadStream, statSync } from "fs";
import path from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import { SESSION_COOKIE, readSession, getSessionFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canAccessDocument } from "@/lib/documentAccess";

export const runtime = "nodejs";
const uploadDir = path.join(process.cwd(), "uploads");

// MIME 类型映射
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
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".ts": "application/typescript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".zip": "application/zip",
  ".rar": "application/x-rar-compressed",
  ".7z": "application/x-7z-compressed",
};

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return mimeMap[ext] || "application/octet-stream";
}

// RFC 5987 编码中文文件名，避免 header 乱码
function encodeFilename(name: string): string {
  // 使用 RFC 5987 的扩展编码
  const encoded = encodeURIComponent(name).replace(/['()]/g, escape).replace(/\*/g, "%2A");
  return `filename*=UTF-8''${encoded}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  // 1. 鉴权检查
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "请先登录后再下载。" }, { status: 401 });
  }

  // 2. 获取 storageKey 参数（URL 自动 decode）
  const { key: rawKey } = await params;
  if (!rawKey) {
    return NextResponse.json({ message: "参数错误。" }, { status: 400 });
  }

  // 3. 安全检查：禁止路径穿越
  const storageKey = decodeURIComponent(rawKey);
  if (storageKey.includes("..") || storageKey.includes("/") || storageKey.includes("\\")) {
    return NextResponse.json({ message: "非法文件名。" }, { status: 400 });
  }

  const filePath = path.join(uploadDir, storageKey);

  // 4. 检查文件是否存在
  let fileStat;
  try {
    fileStat = statSync(filePath);
  } catch {
    return NextResponse.json({ message: "文件不存在或已被删除。" }, { status: 404 });
  }

  // 4.5 文档可见性权限检查（公开/上传者/viewers 列表）
  const allowed = await canAccessDocument(storageKey, session.id, session.role);
  if (!allowed) {
    return NextResponse.json({ message: "无权访问此文档。" }, { status: 403 });
  }

  // 5. 从数据库获取原始文件名（用于下载时显示）
  const [rows] = await getDb().execute<RowDataPacket[]>(
    "SELECT name FROM documents WHERE storage_key = ? LIMIT 1",
    [storageKey]
  );
  const displayName = rows[0]?.name || storageKey;

  // 6. 读取文件流并返回
  const mime = getMimeType(displayName);
  const stream = createReadStream(filePath);

  // 把 Node.js stream 转为 Web ReadableStream
  const webStream = Readable.toWeb(stream) as ReadableStream;

  // 根据 ?inline=1 参数决定是预览（inline）还是下载（attachment）
  const isInline = request.nextUrl.searchParams.get("inline") === "1";
  const disposition = isInline ? "inline" : "attachment";

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(fileStat.size),
      "Content-Disposition": `${disposition}; ${encodeFilename(displayName)}`,
      "Cache-Control": "private, no-cache",
      // 允许浏览器/iframe 正常渲染
      "X-Content-Type-Options": "nosniff",
    },
  });
}
