import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getSessionFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const STATUS_TEXT: Record<string, string> = {
  normal: "正常",
  late: "迟到",
  early: "早退",
  absent: "缺勤",
  overtime: "加班",
};

function pad(n: number) {
  return n < 10 ? "0" + n : "" + n;
}

function dateStr(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * 月度考勤记录（员工视角）：
 * GET /api/attendance/monthly?year=2026&month=7
 * 返回当月工作日记录列表 + 统计（正常/迟到/早退/缺勤）
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  const year = Number(request.nextUrl.searchParams.get("year")) || new Date().getFullYear();
  const month = Number(request.nextUrl.searchParams.get("month")) || new Date().getMonth() + 1;
  if (month < 1 || month > 12) return NextResponse.json({ message: "月份无效" }, { status: 400 });

  const db = getDb();
  const [empRows] = await db.execute<RowDataPacket[]>(
    "SELECT id FROM employees WHERE account_user_id = ? LIMIT 1",
    [session.id]
  );
  const employee = empRows[0]?.id as string | undefined;
  if (!employee) return NextResponse.json({ message: "未找到员工档案，请联系管理员" }, { status: 400 });

  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const todayStr = dateStr(today.getFullYear(), today.getMonth() + 1, today.getDate());

  // 当月全部记录
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT DATE_FORMAT(work_date, '%Y-%m-%d') AS date,
            TIME_FORMAT(clock_in, '%H:%i') AS clockIn,
            TIME_FORMAT(clock_out, '%H:%i') AS clockOut,
            status, work_type AS type
     FROM attendance_records
     WHERE employee_id = ? AND work_date >= ? AND work_date <= ?
     ORDER BY work_date ASC`,
    [employee, dateStr(year, month, 1), dateStr(year, month, daysInMonth)]
  );
  const byDate: Record<string, RowDataPacket> = {};
  for (const r of rows) byDate[r.date] = r;

  // 遍历当月工作日（周一至周五），补缺勤
  const list: Record<string, unknown>[] = [];
  const summary = { normal: 0, late: 0, early: 0, absent: 0 };

  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d);
    const wd = dt.getDay();
    if (wd === 0 || wd === 6) continue; // 跳过周末

    const ds = dateStr(year, month, d);
    const rec = byDate[ds];
    if (rec) {
      const status = String(rec.status || "normal");
      if (status in summary) summary[status as keyof typeof summary]++;
      list.push({
        date: ds,
        day: String(d),
        weekday: WEEKDAYS[wd],
        clockIn: rec.clockIn || "--:--",
        clockOut: rec.clockOut || "--:--",
        status,
        statusText: STATUS_TEXT[status] || "正常",
        statusType: status === "normal" ? "success" : status === "late" || status === "early" ? "warning" : "danger",
      });
    } else if (ds <= todayStr) {
      // 已过工作日但无打卡记录 = 缺勤
      summary.absent++;
      list.push({
        date: ds,
        day: String(d),
        weekday: WEEKDAYS[wd],
        clockIn: "--:--",
        clockOut: "--:--",
        status: "absent",
        statusText: "缺勤",
        statusType: "danger",
      });
    }
    // 未来工作日不显示
  }

  return NextResponse.json({ year, month, list, summary });
}
