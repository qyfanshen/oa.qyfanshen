import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !await readSession(token)) return new NextResponse("请先登录。", { status: 401 });
  const { filename } = await params;
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return new NextResponse("文件不存在。", { status: 404 });
  const [rows] = await getDb().execute<RowDataPacket[]>("SELECT name FROM documents WHERE storage_key = ? LIMIT 1", [filename]);
  if (!rows[0]) return new NextResponse("文件不存在。", { status: 404 });
  try {
    const file = await readFile(path.join(process.cwd(), "uploads", filename));
    await getDb().execute("UPDATE documents SET download_count = download_count + 1 WHERE storage_key = ?", [filename]);
    return new NextResponse(file, { headers: { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(rows[0].name)}`, "Content-Type": "application/octet-stream" } });
  } catch { return new NextResponse("文件不存在。", { status: 404 }); }
}
