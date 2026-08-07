import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { getSessionFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
const uploadDir = path.join(process.cwd(), "uploads", "chat");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  const { messageId } = await params;

  const [rows] = await getDb().execute<any[]>(
    `SELECT m.id, m.conversation_id AS conversationId, m.file_name AS fileName, m.file_url AS fileUrl, m.type
     FROM chat_messages m WHERE m.id = ? LIMIT 1`,
    [messageId]
  );
  const msg = rows[0];
  if (!msg) return NextResponse.json({ message: "消息不存在" }, { status: 404 });

  const [memberRows] = await getDb().execute(
    "SELECT 1 FROM chat_conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1",
    [msg.conversationId, session.id]
  );
  if (!(memberRows as any[]).length) return NextResponse.json({ message: "无权访问" }, { status: 403 });

  const fileUrl: string = msg.fileUrl;
  if (!fileUrl) return NextResponse.json({ message: "文件不存在" }, { status: 404 });

  const storageName = fileUrl.replace("/uploads/chat/", "").replace(/^\//, "");
  if (storageName.includes("..")) return NextResponse.json({ message: "非法路径" }, { status: 400 });

  const filePath = path.join(uploadDir, storageName);
  const displayName = msg.fileName || storageName;
  const extIdx = storageName.lastIndexOf(".");
  const ext = extIdx !== -1 ? storageName.slice(extIdx + 1).toLowerCase() : "";

  try {
    const buffer = await readFile(filePath);

    // Word (.docx) → HTML via mammoth
    if (ext === "docx") {
      const result = await mammoth.convertToHtml({ buffer });
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${displayName}</title>
        <style>
          body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:900px;margin:20px auto;padding:0 20px;color:#333;line-height:1.8}
          h1,h2,h3{color:#1e3a5f} table{border-collapse:collapse;width:100%} td,th{border:1px solid #ddd;padding:8px}
          img{max-width:100%} pre{background:#f5f5f5;padding:12px;border-radius:4px;overflow-x:auto}
        </style></head><body>${result.value}</body></html>`;
      return new NextResponse(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-cache" },
      });
    }

    // Excel (.xlsx, .xls) → HTML via xlsx
    if (ext === "xlsx" || ext === "xls") {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetNames = workbook.SheetNames;
      let tablesHtml = "";
      for (const sheetName of sheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const htmlTable = XLSX.utils.sheet_to_html(worksheet, { editable: false });
        tablesHtml += `<div class="sheet"><h3>${sheetName}</h3>${htmlTable}</div>`;
      }
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${displayName}</title>
        <style>
          body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:20px;background:#fff;color:#333}
          .sheet{margin-bottom:30px} h3{color:#1e3a5f;margin-bottom:10px;border-bottom:2px solid #1e3a5f;padding-bottom:6px}
          table{border-collapse:collapse;width:100%} td,th{border:1px solid #ccc;padding:6px 10px;font-size:13px}
          th{background:#f0f4f8;font-weight:600} tr:nth-child(even){background:#fafafa}
        </style></head><body>${tablesHtml}</body></html>`;
      return new NextResponse(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-cache" },
      });
    }

    // Text files
    if (["txt", "md", "json", "csv", "xml", "html", "css", "js", "ts", "log", "yml", "yaml"].includes(ext)) {
      const text = buffer.toString("utf-8");
      return new NextResponse(text, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-cache" },
      });
    }

    // For images, PDF, and other Office formats, redirect to the download API with inline=1
    // The browser will handle natively
    const inlineUrl = `/api/chat/files/${messageId}?inline=1`;
    return NextResponse.redirect(inlineUrl);
  } catch (e: any) {
    return NextResponse.json({ message: "文件预览失败: " + e.message }, { status: 500 });
  }
}
