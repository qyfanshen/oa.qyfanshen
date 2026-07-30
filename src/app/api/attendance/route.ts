import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
async function getSession(request: NextRequest) { const token = request.cookies.get(SESSION_COOKIE)?.value; return token ? readSession(token) : null; }
async function employeeId(accountId: number) { const [rows] = await getDb().execute<RowDataPacket[]>("SELECT id FROM employees WHERE account_user_id = ? LIMIT 1", [accountId]); return rows[0]?.id as string | undefined; }

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const admin = session.role === "admin" || session.role === "superadmin";
  const sql = "SELECT ar.id, ar.employee_id AS userId, e.name AS employeeName, DATE_FORMAT(ar.work_date, '%Y-%m-%d') AS date, TIME_FORMAT(ar.clock_in, '%H:%i:%s') AS clockIn, TIME_FORMAT(ar.clock_out, '%H:%i:%s') AS clockOut, ar.status, ar.work_type AS type FROM attendance_records ar LEFT JOIN employees e ON e.id = ar.employee_id" + (admin ? " ORDER BY ar.work_date DESC, ar.created_at DESC" : " WHERE ar.employee_id = ? ORDER BY ar.work_date DESC");
  const [rows] = admin ? await getDb().execute<RowDataPacket[]>(sql) : await getDb().execute<RowDataPacket[]>(sql, [await employeeId(session.id) || ""]);
  return NextResponse.json({ records: rows });
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  const allowedRoles = ["employee", "admin", "superadmin", "manager"];
  if (!session || !allowedRoles.includes(session.role)) {
    return NextResponse.json({ message: "当前账号无考勤权限" }, { status: 403 });
  }
  const employee = await employeeId(session.id);
  if (!employee) return NextResponse.json({ message: "未找到员工档案，请联系管理员" }, { status: 400 });
  const { action, workType } = await request.json() as { action?: string; workType?: string };
  const db = getDb();
  if (action === "clockIn") {
    const id = `attendance-${Date.now()}-${randomBytes(3).toString("hex")}`;
    const type = workType === "remote" ? "remote" : "office";
    await db.execute("INSERT INTO attendance_records (id, employee_id, work_date, clock_in, status, work_type) VALUES (?, ?, CURDATE(), CURTIME(), IF(CURTIME() >= '09:00:00', 'late', 'normal'), ?) ON DUPLICATE KEY UPDATE clock_in = COALESCE(clock_in, VALUES(clock_in)), status = IF(clock_in IS NULL AND CURTIME() >= '09:00:00', 'late', status)", [id, employee, type]);
  } else if (action === "clockOut") {
    await db.execute("UPDATE attendance_records SET clock_out = COALESCE(clock_out, CURTIME()) WHERE employee_id = ? AND work_date = CURDATE()", [employee]);
  } else return NextResponse.json({ message: "打卡动作无效" }, { status: 400 });
  const [rows] = await db.execute<RowDataPacket[]>("SELECT DATE_FORMAT(work_date, '%Y-%m-%d') AS date, TIME_FORMAT(clock_in, '%H:%i:%s') AS clockIn, TIME_FORMAT(clock_out, '%H:%i:%s') AS clockOut, status, work_type AS type FROM attendance_records WHERE employee_id = ? AND work_date = CURDATE()", [employee]);
  return NextResponse.json({ record: rows[0] });
}
