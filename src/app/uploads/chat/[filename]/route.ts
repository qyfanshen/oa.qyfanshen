import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

// GET /uploads/chat/:filename  聊天文件访问（登录即可，用于 <img src> 和文件下载）
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const session = await getSessionFromRequest(_request);
  if (!session) return new NextResponse("请先登录。", { status: 401 });

  const { filename } = await params;
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    return new NextResponse("文件不存在。", { status: 404 });
  }

  try {
    const file = await readFile(path.join(process.cwd(), "uploads", "chat", filename));
    const ext = path.extname(filename).toLowerCase();
    const contentType =
      ext === ".png" ? "image/png"
      : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
      : ext === ".gif" ? "image/gif"
      : ext === ".webp" ? "image/webp"
      : ext === ".svg" ? "image/svg+xml"
      : ext === ".pdf" ? "application/pdf"
      : ext === ".txt" ? "text/plain; charset=utf-8"
      : "application/octet-stream";
    return new NextResponse(file, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("文件不存在。", { status: 404 });
  }
}
