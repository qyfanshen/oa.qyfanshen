import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildExpenseSteps } from "@/lib/approval-flow";

export const runtime = "nodejs";
const uploadDir = path.join(process.cwd(), "uploads", "expenses");
const maxFiles = 5;
const maxFileSize = 10 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
async function currentSession(request: NextRequest) { const token = request.cookies.get(SESSION_COOKIE)?.value; return token ? readSession(token) : null; }
async function employeeId(accountId: number) { const [rows] = await getDb().execute<RowDataPacket[]>("SELECT id FROM employees WHERE account_user_id = ? LIMIT 1", [accountId]); return rows[0]?.id as string | undefined; }
type Attachment = { name: string; url: string; size: number; type: string; storageKey: string };

function parseAttachments(value: unknown): Attachment[] {
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.url === "string" && typeof item.name === "string") : [];
  } catch {
    return [];
  }
}

async function saveAttachments(files: File[]) {
  if (files.length > maxFiles) throw new Error(`最多上传 ${maxFiles} 个附件。`);
  await mkdir(uploadDir, { recursive: true });
  const attachments: Attachment[] = [];
  for (const file of files) {
    if (file.size <= 0) continue;
    if (file.size > maxFileSize) throw new Error("单个附件不能超过 10MB。");
    if (!allowedTypes.has(file.type)) throw new Error("附件仅支持图片或 PDF。");
    const original = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "attachment";
    const storageKey = `${Date.now()}-${randomBytes(5).toString("hex")}-${original}`;
    await writeFile(path.join(uploadDir, storageKey), Buffer.from(await file.arrayBuffer()));
    attachments.push({ name: file.name, url: `/expense-attachments/${storageKey}`, size: file.size, type: file.type, storageKey });
  }
  return attachments;
}

export async function GET(request: NextRequest) {
  const session = await currentSession(request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const admin = session.role === "admin" || session.role === "superadmin" || session.role === "manager";
  const sql = "SELECT er.id, er.employee_id AS userId, e.name AS applicantName, er.expense_type AS type, er.amount, DATE_FORMAT(er.expense_date, '%Y-%m-%d') AS date, er.description, er.status, er.attachments, DATE_FORMAT(er.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt FROM expense_reports er LEFT JOIN employees e ON e.id = er.employee_id" + (admin ? " ORDER BY er.created_at DESC" : " WHERE er.employee_id = ? ORDER BY er.created_at DESC");
  const [rows] = admin ? await getDb().execute<RowDataPacket[]>(sql) : await getDb().execute<RowDataPacket[]>(sql, [await employeeId(session.id) || ""]);
  return NextResponse.json({ records: rows.map((row) => ({ ...row, amount: Number(row.amount), attachments: parseAttachments(row.attachments) })) });
}

export async function POST(request: NextRequest) {
  const session = await currentSession(request);
  // 任何已登录账号都可以提交报销（关联到当前账号的 employee 档案）
  const allowedRoles = ["employee", "admin", "superadmin", "manager"];
  if (!session || !allowedRoles.includes(session.role)) return NextResponse.json({ message: "当前账号无报销权限" }, { status: 403 });
  const employee = await employeeId(session.id);
  if (!employee) return NextResponse.json({ message: "未找到员工档案，请联系管理员" }, { status: 400 });
  // 强制提交参数（重复弹窗中用户选择「仍然提交」）跳过重复检测
  const forceSubmit = new URL(request.url).searchParams.get("force") === "1";
  const contentType = request.headers.get("content-type") || "";
  const form = contentType.includes("multipart/form-data") ? await request.formData() : null;
  const input = form ? {
    type: form.get("type"),
    amount: form.get("amount"),
    date: form.get("date"),
    description: form.get("description"),
  } : await request.json() as { type?: unknown; amount?: unknown; date?: unknown; description?: unknown };
  const types = ["travel", "entertainment", "office", "transport", "other"];
  const type = String(input.type || ""); const amount = Number(input.amount); const date = String(input.date || ""); const description = typeof input.description === "string" ? input.description.trim() : "";
  if (!types.includes(type) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !description || !Number.isFinite(amount) || amount <= 0 || amount > 10000000) return NextResponse.json({ message: "请完整填写有效的报销信息" }, { status: 400 });
  let attachments: Attachment[] = [];
  try {
    attachments = form ? await saveAttachments(form.getAll("attachments").filter((file): file is File => file instanceof File)) : [];
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "附件上传失败。" }, { status: 400 });
  }
  // 重复提交检测：同一员工 + 同类型 + 同金额 + 同日期 视为重复（force=1 时跳过）
  if (!forceSubmit) {
    const [[dupRow]] = await getDb().execute<RowDataPacket[]>(
      "SELECT id, status FROM expense_reports WHERE employee_id = ? AND expense_type = ? AND amount = ? AND expense_date = ? LIMIT 1",
      [employee, type, amount, date]
    );
    if (dupRow) {
      return NextResponse.json({
        duplicate: true,
        message: "检测到相同记录：同一费用类型、金额和日期的申请已存在，请确认是否重复提交。",
        existing: { id: dupRow.id, status: dupRow.status },
      }, { status: 409 });
    }
  }
  const id = `expense-${Date.now()}-${randomBytes(3).toString("hex")}`;
  const labels: Record<string, string> = { travel: "差旅费", entertainment: "招待费", office: "办公费", transport: "交通费", other: "其他" };
  // 解析当前员工的部门
  const [deptRows] = await getDb().execute<RowDataPacket[]>("SELECT department FROM employees WHERE id = ? LIMIT 1", [employee]);
  const department = (deptRows[0]?.department as string) || "";
  // 方案 A：按金额动态生成审批步骤
  const steps = await buildExpenseSteps(amount, department, employee);
  const pool = getDb();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute("INSERT INTO expense_reports (id, employee_id, expense_type, amount, expense_date, description, attachments) VALUES (?, ?, ?, ?, ?, ?, ?)", [id, employee, type, amount, date, description, JSON.stringify(attachments)]);
    await conn.execute("INSERT INTO approval_requests (id, flow_id, applicant_id, title, content, approval_type, amount, status, current_step, steps, attachments) VALUES (?, 'expense', ?, ?, ?, 'expense', ?, 'pending', 0, ?, ?)", [id, employee, `${labels[type]}报销申请`, `${date}：${description}`, amount, JSON.stringify(steps), JSON.stringify(attachments)]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return NextResponse.json({ id }, { status: 201 });
}
