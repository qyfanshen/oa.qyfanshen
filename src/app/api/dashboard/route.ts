import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getSessionFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

/**
 * 工作台数据：
 *  - 管理员/经理：全公司统计 + 待办概览
 *  - 员工：个人待审批数、今日考勤状态、最近待办列表
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  const db = getDb();
  const isAdmin = ["admin", "superadmin", "manager"].includes(session.role);
  const [empRows] = await db.execute<RowDataPacket[]>(
    "SELECT id FROM employees WHERE account_user_id = ? LIMIT 1",
    [session.id]
  );
  const employee = empRows[0]?.id as string | undefined;

  let result: Record<string, unknown> = {
    role: session.role,
    pendingCount: 0,
    attendanceDone: false,
    todoList: [],
  };

  if (isAdmin) {
    // 管理员：全公司统计
    const [rows] = await db.query<RowDataPacket[]>(`
      SELECT
        (SELECT COUNT(*) FROM employees WHERE status = 'active') AS totalEmployees,
        (SELECT COUNT(*) FROM attendance_records WHERE work_date = CURDATE() AND clock_in IS NOT NULL) AS todayAttendance,
        (SELECT COUNT(*) FROM approval_requests WHERE status IN ('pending', 'processing')) AS pendingApprovals,
        (SELECT COUNT(*) FROM projects WHERE status NOT IN ('completed', 'delivered')) AS activeProjects,
        (SELECT COALESCE(SUM(COALESCE(budget, 0)), 0) FROM projects WHERE created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND created_at < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)) AS monthlyRevenue,
        (SELECT COUNT(*) FROM partners) AS partnerCount
    `);
    const row = rows[0] || {};
    const pendingCount = Number(row.pendingApprovals) || 0;
    // 管理员最近待审批
    const [todo] = await db.execute<RowDataPacket[]>(
      `SELECT ar.id, ar.title, e.name AS applicant, DATE_FORMAT(ar.created_at, '%m-%d %H:%i') AS time
       FROM approval_requests ar LEFT JOIN employees e ON e.id = ar.applicant_id
       WHERE ar.status IN ('pending', 'processing') ORDER BY ar.created_at DESC LIMIT 10`
    );
    const [attRows] = await db.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS c FROM attendance_records WHERE work_date = CURDATE() AND clock_in IS NOT NULL"
    );
    result = {
      role: session.role,
      pendingCount,
      attendanceDone: Number(attRows[0]?.c) > 0,
      todoList: todo,
      stats: {
        totalEmployees: Number(row.totalEmployees) || 0,
        todayAttendance: Number(row.todayAttendance) || 0,
        pendingApprovals: pendingCount,
        activeProjects: Number(row.activeProjects) || 0,
        monthlyRevenue: Number(row.monthlyRevenue) || 0,
        partnerCount: Number(row.partnerCount) || 0,
      },
    };
  } else if (employee) {
    // 员工：待我审批（当前步骤审批人是我的）
    const [cntRows] = await db.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM approval_requests
       WHERE status IN ('pending', 'processing')
         AND JSON_UNQUOTE(JSON_EXTRACT(steps, CONCAT('$[', current_step, '].approverId'))) = ?`,
      [employee]
    );
    const [todo] = await db.execute<RowDataPacket[]>(
      `SELECT ar.id, ar.title, e.name AS applicant, DATE_FORMAT(ar.created_at, '%m-%d %H:%i') AS time
       FROM approval_requests ar LEFT JOIN employees e ON e.id = ar.applicant_id
       WHERE ar.status IN ('pending', 'processing')
         AND JSON_UNQUOTE(JSON_EXTRACT(ar.steps, CONCAT('$[', ar.current_step, '].approverId'))) = ?
       ORDER BY ar.created_at DESC LIMIT 10`,
      [employee]
    );
    const [attRows] = await db.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS c FROM attendance_records WHERE employee_id = ? AND work_date = CURDATE() AND clock_in IS NOT NULL",
      [employee]
    );
    result = {
      role: session.role,
      pendingCount: Number(cntRows[0]?.c) || 0,
      attendanceDone: Number(attRows[0]?.c) > 0,
      todoList: todo,
    };
  }

  return NextResponse.json(result);
}
