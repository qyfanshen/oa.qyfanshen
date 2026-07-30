import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await readSession(token) : null;
  if (!session || !["admin", "superadmin", "manager"].includes(session.role)) return NextResponse.json({ message: "仅管理员可查看工作台。" }, { status: 403 });
  const [rows] = await getDb().query<RowDataPacket[]>(`
    SELECT
      (SELECT COUNT(*) FROM employees WHERE status = 'active') AS totalEmployees,
      (SELECT COUNT(*) FROM attendance_records WHERE work_date = CURDATE() AND clock_in IS NOT NULL) AS todayAttendance,
      (SELECT COUNT(*) FROM approval_requests WHERE status IN ('pending', 'processing')) AS pendingApprovals,
      (SELECT COUNT(*) FROM projects WHERE status NOT IN ('completed', 'delivered')) AS activeProjects,
      (SELECT COALESCE(SUM(COALESCE(budget, 0)), 0) FROM projects WHERE created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND created_at < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)) AS monthlyRevenue,
      (SELECT COUNT(*) FROM partners) AS partnerCount
  `);
  const row = rows[0] || {};
  return NextResponse.json({ stats: {
    totalEmployees: Number(row.totalEmployees) || 0,
    todayAttendance: Number(row.todayAttendance) || 0,
    pendingApprovals: Number(row.pendingApprovals) || 0,
    activeProjects: Number(row.activeProjects) || 0,
    monthlyRevenue: Number(row.monthlyRevenue) || 0,
    partnerCount: Number(row.partnerCount) || 0,
  } });
}
