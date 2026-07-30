import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
const uploadDir = path.join(process.cwd(), "uploads");

async function sessionFor(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return token ? readSession(token) : null;
}

export async function GET(request: NextRequest) {
  if (!await sessionFor(request)) return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  const [rows] = await getDb().execute<RowDataPacket[]>(
    "SELECT id, name, document_type AS type, category, file_size AS size, uploader_id AS uploaderId, DATE_FORMAT(created_at, '%Y-%m-%d') AS uploadDate, download_count AS downloads, storage_key AS storageKey, version FROM documents ORDER BY updated_at DESC"
  );
  return NextResponse.json({ documents: rows });
}

export async function POST(request: NextRequest) {
  const session = await sessionFor(request);
  if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
    return NextResponse.json({ message: "只有管理员可以上传资料。" }, { status: 403 });
  }
  const form = await request.formData();
  const file = form.get("file");
  const title = typeof form.get("title") === "string" ? String(form.get("title")).trim().slice(0, 255) : "";
  const category = typeof form.get("category") === "string" ? String(form.get("category")).trim().slice(0, 100) : "其他";
  const documentId = typeof form.get("documentId") === "string" ? String(form.get("documentId")) : "";

  if (!(file instanceof File) || file.size === 0 || file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ message: "请选择不超过 25MB 的文件。" }, { status: 400 });
  }

  // 提取并保留原始扩展名
  const originalName = file.name;
  const ext = path.extname(originalName).toLowerCase(); // 含点，如 ".pdf"
  const baseName = path.basename(originalName, path.extname(originalName));

  // 清理文件名（保留中英文、数字、点、连字符、下划线）
  const safeBaseName = baseName.replace(/[^\w\u4e00-\u9fa5.\-]/g, "_").slice(0, 100);

  // 最终存储文件名：时间戳-随机-清理后文件名.原扩展名
  const storageKey = `${Date.now()}-${randomBytes(5).toString("hex")}-${safeBaseName}${ext}`;

  // 确保显示名带扩展名
  const displayName = title ? (/\.[a-zA-Z0-9]+$/.test(title) ? title : `${title}${ext}`) : `${safeBaseName}${ext}`;

  // 写入文件
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, storageKey), Buffer.from(await file.arrayBuffer()));

  // 判定文件类型
  const extLower = ext.toLowerCase();
  const type = /\.(doc|docx|pdf)$/i.test(extLower)
    ? "manual"
    : /\.(xls|xlsx|csv)$/i.test(extLower)
    ? "report"
    : /\.(ppt|pptx)$/i.test(extLower)
    ? "template"
    : "other";

  // 格式化文件大小
  const size = file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))}KB` : `${(file.size / 1024 / 1024).toFixed(1)}MB`;

  const db = getDb();
  if (documentId) {
    await db.execute(
      "UPDATE documents SET name = ?, file_size = ?, storage_key = ?, version = version + 1, updated_at = NOW() WHERE id = ?",
      [displayName, size, storageKey, documentId]
    );
    return NextResponse.json({ id: documentId, storageKey, name: displayName });
  }

  const id = `doc-${Date.now()}-${randomBytes(3).toString("hex")}`;
  await db.execute(
    "INSERT INTO documents (id, name, document_type, category, file_size, uploader_id, storage_key) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, displayName, type, category, size, String(session.id), storageKey]
  );
  return NextResponse.json({ id, storageKey, name: displayName }, { status: 201 });
}
