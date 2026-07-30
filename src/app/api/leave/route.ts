import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildLeaveSteps } from "@/lib/approval-flow";

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
  const sql = "SELECT lr.id, lr.employee_id AS userId, e.name AS applicantName, lr.leave_type AS type, DATE_FORMAT(lr.start_date, '%Y-%m-%d') AS startDate, DATE_FORMAT(lr.end_date, '%Y-%m-%d') AS endDate, lr.days, lr.reason, lr.status, lr.approver_id AS approverId, DATE_FORMAT(lr.approved_at, '%Y-%m-%d %H:%i:%s') AS approvedAt, lr.comment, DATE_FORMAT(lr.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt FROM leave_requests lr LEFT JOIN employees e ON e.id = lr.employee_id" + (admin ? " ORDER BY lr.created_at DESC" : " WHERE lr.employee_id = ? ORDER BY lr.created_at DESC");
  const [rows] = admin ? await getDb().execute<RowDataPacket[]>(sql) : await getDb().execute<RowDataPacket[]>(sql, [await employeeId(session.id) || ""]);
  return NextResponse.json({ records: rows.map((row) => ({ ...row, days: Number(row.days) })) });
}

export async function POST(request: NextRequest) {
  const session = await sessionFor(request);
  // 任何已登录账号都可以提交请假申请（关联到当前账号的 employee 档案）
  const allowedRoles = ["employee", "admin", "superadmin", "manager"];
  if (!session || !allowedRoles.includes(session.role)) return NextResponse.json({ message: "当前账号无请假权限" }, { status: 403 });
  const employee = await employeeId(session.id);
  if (!employee) return NextResponse.json({ message: "未找到员工档案，请联系管理员" }, { status: 400 });
  // 强制提交参数（重复弹窗中用户选择「仍然提交」）跳过重复检测
  const forceSubmit = new URL(request.url).searchParams.get("force") === "1";
  const input = await request.json() as { type?: string; startDate?: string; endDate?: string; reason?: string };
  const types = ["annual", "sick", "personal", "marriage", "bereavement", "maternity", "other"];
  const type = String(input.type || "");
  const startDate = String(input.startDate || "");
  const endDate = String(input.endDate || "");
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  const days = Math.floor((Date.parse(`${endDate}T00:00:00`) - Date.parse(`${startDate}T00:00:00`)) / 86400000) + 1;
  if (!types.includes(type) || !reason || !Number.isFinite(days) || days <= 0 || days > 366) return NextResponse.json({ message: "请完整填写有效的请假信息" }, { status: 400 });
  // 重复提交检测：同一员工 + 同类型 + 同起止日期 视为重复（force=1 时跳过）
  if (!forceSubmit) {
    const [[dupRow]] = await getDb().execute<RowDataPacket[]>(
      "SELECT id, status FROM leave_requests WHERE employee_id = ? AND leave_type = ? AND start_date = ? AND end_date = ? LIMIT 1",
      [employee, type, startDate, endDate]
    );
    if (dupRow) {
      return NextResponse.json({
        duplicate: true,
        message: "检测到相同记录：同一请假类型、开始和结束日期的申请已存在，请确认是否重复提交。",
        existing: { id: dupRow.id, status: dupRow.status },
      }, { status: 409 });
    }
  }
  const id = `leave-${Date.now()}-${randomBytes(3).toString("hex")}`;
  const labels: Record<string, string> = { annual: "年假", sick: "病假", personal: "事假", marriage: "婚假", bereavement: "丧假", maternity: "产假", other: "其他" };
  // 解析当前员工的部门
  const [deptRows] = await getDb().execute<RowDataPacket[]>("SELECT department FROM employees WHERE id = ? LIMIT 1", [employee]);
  const department = (deptRows[0]?.department as string) || "";
  // 方案 2：按请假类型 + 天数动态生成审批步骤
  const steps = await buildLeaveSteps(type as "annual" | "sick" | "personal" | "marriage" | "bereavement" | "maternity" | "other", days, department);
  const db = getDb();
  await db.execute("INSERT INTO leave_requests (id, employee_id, leave_type, start_date, end_date, days, reason) VALUES (?, ?, ?, ?, ?, ?, ?)", [id, employee, type, startDate, endDate, days, reason]);
  await db.execute("INSERT INTO approval_requests (id, flow_id, applicant_id, title, content, approval_type, status, current_step, steps) VALUES (?, 'leave', ?, ?, ?, 'leave', 'pending', 0, ?)", [id, employee, `${labels[type]}申请`, `${startDate} 至 ${endDate}，共 ${days} 天：${reason}`, JSON.stringify(steps)]);
  return NextResponse.json({ id }, { status: 201 });
}
