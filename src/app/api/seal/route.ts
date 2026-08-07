import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildSealSteps } from "@/lib/approval-flow";

export const runtime = "nodejs";

async function sessionFor(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return token ? readSession(token) : null;
}

async function employeeId(accountId: number) {
  const [rows] = await getDb().execute<RowDataPacket[]>("SELECT id FROM employees WHERE account_user_id = ? LIMIT 1", [accountId]);
  return rows[0]?.id as string | undefined;
}

export async function GET(request: NextRequest) {
  const session = await sessionFor(request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const admin = session.role === "admin" || session.role === "superadmin";
  const sql = "SELECT sr.id, sr.employee_id AS userId, e.name AS applicantName, sr.seal_type AS type, sr.document_name AS documentName, sr.copies, sr.purpose, sr.urgency, sr.status, sr.approver_id AS approverId, DATE_FORMAT(sr.approved_at, '%Y-%m-%d %H:%i:%s') AS approvedAt, sr.comment, DATE_FORMAT(sr.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt FROM seal_requests sr LEFT JOIN employees e ON e.id = sr.employee_id" + (admin ? " ORDER BY sr.created_at DESC" : " WHERE sr.employee_id = ? ORDER BY sr.created_at DESC");
  const [rows] = admin ? await getDb().execute<RowDataPacket[]>(sql) : await getDb().execute<RowDataPacket[]>(sql, [await employeeId(session.id) || ""]);
  return NextResponse.json({ records: rows.map((row) => ({ ...row, copies: Number(row.copies) })) });
}

export async function POST(request: NextRequest) {
  const session = await sessionFor(request);
  const allowedRoles = ["employee", "admin", "superadmin", "manager"];
  if (!session || !allowedRoles.includes(session.role)) return NextResponse.json({ message: "当前账号无公章审批权限" }, { status: 403 });
  const employee = await employeeId(session.id);
  if (!employee) return NextResponse.json({ message: "未找到员工档案，请联系管理员" }, { status: 400 });
  // 强制提交参数（重复弹窗中用户选择「仍然提交」）跳过重复检测
  const forceSubmit = new URL(request.url).searchParams.get("force") === "1";
  const input = await request.json() as { type?: string; documentName?: string; copies?: number; purpose?: string; urgency?: string };
  const sealTypes = ["company", "contract", "finance", "legal_person", "department"];
  const type = String(input.type || "");
  const documentName = typeof input.documentName === "string" ? input.documentName.trim() : "";
  const copies = Number(input.copies) || 1;
  const purpose = typeof input.purpose === "string" ? input.purpose.trim() : "";
  const urgency = input.urgency === "urgent" ? "urgent" : "normal";
  if (!sealTypes.includes(type) || !documentName || !purpose || copies < 1 || copies > 999) {
    return NextResponse.json({ message: "请完整填写有效的用章信息" }, { status: 400 });
  }
  // 重复提交检测：同一员工 + 同类型 + 同文件名 + 同事由 视为重复
  if (!forceSubmit) {
    const [[dupRow]] = await getDb().execute<RowDataPacket[]>(
      "SELECT id, status FROM seal_requests WHERE employee_id = ? AND seal_type = ? AND document_name = ? AND purpose = ? LIMIT 1",
      [employee, type, documentName, purpose]
    );
    if (dupRow) {
      return NextResponse.json({
        duplicate: true,
        message: "检测到相同记录：同一印章类型、文件名称和事由的申请已存在，请确认是否重复提交。",
        existing: { id: dupRow.id, status: dupRow.status },
      }, { status: 409 });
    }
  }
  const id = `seal-${Date.now()}-${randomBytes(3).toString("hex")}`;
  const labels: Record<string, string> = { company: "公章", contract: "合同章", finance: "财务章", legal_person: "法人章", department: "部门章" };
  // 解析当前员工的部门
  const [deptRows] = await getDb().execute<RowDataPacket[]>("SELECT department FROM employees WHERE id = ? LIMIT 1", [employee]);
  const department = (deptRows[0]?.department as string) || "";
  // 按印章类型动态生成审批步骤
  const steps = await buildSealSteps(type as "company" | "contract" | "finance" | "legal_person" | "department", department, employee);
  const pool = getDb();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute("INSERT INTO seal_requests (id, employee_id, seal_type, document_name, copies, purpose, urgency) VALUES (?, ?, ?, ?, ?, ?, ?)", [id, employee, type, documentName, copies, purpose, urgency]);
    await conn.execute("INSERT INTO approval_requests (id, flow_id, applicant_id, title, content, approval_type, status, current_step, steps) VALUES (?, 'seal', ?, ?, ?, 'seal', 'pending', 0, ?)", [id, employee, `${labels[type]}用章申请`, `${urgency === "urgent" ? "【紧急】" : ""}${documentName}，${copies}份：${purpose}`, JSON.stringify(steps)]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return NextResponse.json({ id }, { status: 201 });
}
