import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildExpenseSteps } from "@/lib/approval-flow";

export const runtime = "nodejs";

async function getSession(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return token ? readSession(token) : null;
}

async function employeeId(accountId: number) {
  const [rows] = await getDb().execute<RowDataPacket[]>("SELECT id FROM employees WHERE account_user_id = ? LIMIT 1", [accountId]);
  return rows[0]?.id as string | undefined;
}

function parseJsonArray(value: unknown) {
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  const db = getDb();
  const isApprover = session.role === "admin" || session.role === "superadmin" || session.role === "manager";
  const [rows] = isApprover
    ? await db.execute<RowDataPacket[]>("SELECT ar.id, ar.flow_id AS flowId, ar.applicant_id AS applicantId, e.name AS applicantName, ar.title, ar.content, ar.approval_type AS type, ar.amount, ar.status, ar.current_step AS currentStep, ar.steps, ar.attachments, DATE_FORMAT(ar.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt, DATE_FORMAT(ar.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt FROM approval_requests ar LEFT JOIN employees e ON e.id = ar.applicant_id ORDER BY ar.created_at DESC")
    : await db.execute<RowDataPacket[]>("SELECT ar.id, ar.flow_id AS flowId, ar.applicant_id AS applicantId, e.name AS applicantName, ar.title, ar.content, ar.approval_type AS type, ar.amount, ar.status, ar.current_step AS currentStep, ar.steps, ar.attachments, DATE_FORMAT(ar.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt, DATE_FORMAT(ar.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt FROM approval_requests ar LEFT JOIN employees e ON e.id = ar.applicant_id WHERE ar.applicant_id = ? ORDER BY ar.created_at DESC", [await employeeId(session.id) || ""]);
  return NextResponse.json({ approvals: rows.map((row) => ({ ...row, steps: parseJsonArray(row.steps), attachments: parseJsonArray(row.attachments), amount: row.amount == null ? undefined : Number(row.amount) })) });
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  // 任何已登录账号都可以提交申请
  const allowedRoles = ["employee", "admin", "superadmin", "manager"];
  if (!session || !allowedRoles.includes(session.role)) return NextResponse.json({ message: "当前账号无申请权限" }, { status: 403 });
  const applicantId = await employeeId(session.id);
  if (!applicantId) return NextResponse.json({ message: "未找到员工档案，请联系管理员。" }, { status: 400 });
  const input = await request.json() as { type?: string; title?: string; content?: string; amount?: number };
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 255) : "";
  const content = typeof input.content === "string" ? input.content.trim() : "";
  const types = ["expense", "leave", "travel", "seal", "contract", "purchase", "other"];
  const type = types.includes(String(input.type)) ? String(input.type) : "other";
  if (!title || !content) return NextResponse.json({ message: "请填写申请标题和内容。" }, { status: 400 });
  const id = `approval-${Date.now()}-${randomBytes(3).toString("hex")}`;
  // 方案 A：通用申请默认走经理+财务的简单流程（金额为0时只走经理）
  const amount = Number(input.amount) > 0 ? Number(input.amount) : 0;
  const [deptRows] = await getDb().execute<RowDataPacket[]>("SELECT department FROM employees WHERE id = ? LIMIT 1", [applicantId]);
  const department = (deptRows[0]?.department as string) || "";
  // 金额为 0 时也走一个经理审批（保证流程非空）
  const steps = await buildExpenseSteps(amount > 0 ? amount : 1, department);
  await getDb().execute("INSERT INTO approval_requests (id, flow_id, applicant_id, title, content, approval_type, amount, status, current_step, steps) VALUES (?, 'employee_custom', ?, ?, ?, ?, ?, 'pending', 0, ?)", [id, applicantId, title, content, type, amount > 0 ? amount : null, JSON.stringify(steps)]);
  return NextResponse.json({ id }, { status: 201 });
}
