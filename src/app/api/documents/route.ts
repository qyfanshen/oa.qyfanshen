import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getSessionFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
const uploadDir = path.join(process.cwd(), "uploads");

async function sessionFor(request: NextRequest) {
  return getSessionFromRequest(request);
}

async function currentEmployeeId(accountId: number): Promise<string | undefined> {
  const [rows] = await getDb().execute<RowDataPacket[]>(
    "SELECT id FROM employees WHERE account_user_id = ? LIMIT 1",
    [accountId]
  );
  return rows[0]?.id as string | undefined;
}

export async function GET(request: NextRequest) {
  const session = await sessionFor(request);
  if (!session) return NextResponse.json({ message: "请先登录。" }, { status: 401 });

  const isAdmin = session.role === "admin" || session.role === "superadmin" || session.role === "manager";
  const employee = isAdmin ? null : await currentEmployeeId(session.id);

  let sql: string;
  let params: (string | number)[] = [];

  if (isAdmin) {
    sql = "SELECT d.id, d.name, d.document_type AS type, d.category, d.file_size AS size, d.uploader_id AS uploaderId, e.name AS uploaderName, DATE_FORMAT(d.created_at, '%Y-%m-%d') AS uploadDate, d.download_count AS downloads, d.storage_key AS storageKey, d.version, d.visibility FROM documents d LEFT JOIN employees e ON e.id = d.uploader_id ORDER BY d.updated_at DESC";
  } else {
    // 员工：可见的文档 = 公开的 OR 我自己上传的 OR 在 viewers 列表里有我
    sql = `SELECT d.id, d.name, d.document_type AS type, d.category, d.file_size AS size, d.uploader_id AS uploaderId, e.name AS uploaderName, DATE_FORMAT(d.created_at, '%Y-%m-%d') AS uploadDate, d.download_count AS downloads, d.storage_key AS storageKey, d.version, d.visibility FROM documents d LEFT JOIN employees e ON e.id = d.uploader_id
           WHERE d.visibility = 'all'
              OR d.uploader_id = ?
              OR EXISTS (SELECT 1 FROM document_viewers WHERE document_id = d.id AND employee_id = ?)
           ORDER BY d.updated_at DESC`;
    params = [String(employee || ""), String(employee || "")];
  }

  const [rows] = await getDb().execute<RowDataPacket[]>(sql, params);
  return NextResponse.json({ documents: rows });
}

export async function POST(request: NextRequest) {
  const session = await sessionFor(request);
  // 任何已登录账号都可以上传（不仅限管理员）
  const allowedRoles = ["admin", "superadmin", "manager", "employee"];
  if (!session || !allowedRoles.includes(session.role)) {
    return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  }
  const uploaderId = await currentEmployeeId(session.id);
  if (!uploaderId) return NextResponse.json({ message: "未找到员工档案" }, { status: 400 });

  const form = await request.formData();
  const file = form.get("file");
  const title = typeof form.get("title") === "string" ? String(form.get("title")).trim().slice(0, 255) : "";
  const category = typeof form.get("category") === "string" ? String(form.get("category")).trim().slice(0, 100) : "其他";
  const documentId = typeof form.get("documentId") === "string" ? String(form.get("documentId")) : "";

  if (!(file instanceof File) || file.size === 0 || file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ message: "请选择不超过 25MB 的文件。" }, { status: 400 });
  }

  // 接收 viewers（逗号分隔的 employee_id 列表），有 viewers → 私有，否则公开
  const viewersRaw = form.get("viewers");
  const viewers = typeof viewersRaw === "string"
    ? viewersRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const visibility = viewers.length > 0 ? "private" : "all";

  // 提取并保留原始扩展名
  const originalName = file.name;
  const ext = path.extname(originalName).toLowerCase();
  const baseName = path.basename(originalName, path.extname(originalName));
  const safeBaseName = baseName.replace(/[^\w\u4e00-\u9fa5.\-]/g, "_").slice(0, 100);
  const storageKey = `${Date.now()}-${randomBytes(5).toString("hex")}-${safeBaseName}${ext}`;
  const displayName = title ? (/\.[a-zA-Z0-9]+$/.test(title) ? title : `${title}${ext}`) : `${safeBaseName}${ext}`;

  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, storageKey), Buffer.from(await file.arrayBuffer()));

  const extLower = ext.toLowerCase();
  const type = /\.(doc|docx|pdf)$/i.test(extLower)
    ? "manual"
    : /\.(xls|xlsx|csv)$/i.test(extLower)
    ? "report"
    : /\.(ppt|pptx)$/i.test(extLower)
    ? "template"
    : "other";
  const size = file.size < 1024 * 1024
    ? `${Math.max(1, Math.round(file.size / 1024))}KB`
    : `${(file.size / 1024 / 1024).toFixed(1)}MB`;

  const db = getDb();
  if (documentId) {
    await db.execute(
      "UPDATE documents SET name = ?, file_size = ?, storage_key = ?, visibility = ?, version = version + 1, updated_at = NOW() WHERE id = ?",
      [displayName, size, storageKey, visibility, documentId]
    );
    // 替换 viewers
    await db.execute("DELETE FROM document_viewers WHERE document_id = ?", [documentId]);
    if (viewers.length > 0) {
      await db.query("INSERT INTO document_viewers (document_id, employee_id) VALUES ?", [viewers.map((empId) => [documentId, empId])]);
    }
    return NextResponse.json({ id: documentId, storageKey, name: displayName, visibility, viewers });
  }

  const id = `doc-${Date.now()}-${randomBytes(3).toString("hex")}`;
  await db.execute(
    "INSERT INTO documents (id, name, document_type, category, file_size, uploader_id, storage_key, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, displayName, type, category, size, uploaderId, storageKey, visibility]
  );
  if (viewers.length > 0) {
    await db.query("INSERT INTO document_viewers (document_id, employee_id) VALUES ?", [viewers.map((empId) => [id, empId])]);
  }
  return NextResponse.json({ id, storageKey, name: displayName, visibility, viewers }, { status: 201 });
}