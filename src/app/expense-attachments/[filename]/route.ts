import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type AttachmentRow = RowDataPacket & { attachments?: string | unknown };

function parseAttachments(value: unknown): Array<{ storageKey?: string }> {
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function contentType(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".pdf") return "application/pdf";
  return "application/octet-stream";
}

async function attachmentExists(filename: string) {
  const [expenseRows] = await getDb().execute<AttachmentRow[]>("SELECT attachments FROM expense_reports WHERE attachments IS NOT NULL");
  if (expenseRows.some((row) => parseAttachments(row.attachments).some((item) => item.storageKey === filename))) return true;

  const [approvalRows] = await getDb().execute<AttachmentRow[]>("SELECT attachments FROM approval_requests WHERE attachments IS NOT NULL");
  return approvalRows.some((row) => parseAttachments(row.attachments).some((item) => item.storageKey === filename));
}

export async function GET(request: NextRequest, context: { params: Promise<{ filename: string }> }) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await readSession(token) : null;
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  const { filename } = await context.params;
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return NextResponse.json({ message: "附件不存在" }, { status: 404 });
  if (!(await attachmentExists(filename))) return NextResponse.json({ message: "附件不存在" }, { status: 404 });

  try {
    const file = await readFile(path.join(process.cwd(), "uploads", "expenses", filename));
    return new NextResponse(file, {
      headers: {
        "Content-Type": contentType(filename),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ message: "附件不存在" }, { status: 404 });
  }
}
