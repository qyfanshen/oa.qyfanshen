import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getSessionFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { validateLocation } from "@/lib/location";

export const runtime = "nodejs";
function getSession(request: NextRequest) { return getSessionFromRequest(request); }
async function employeeId(accountId: number) { const [rows] = await getDb().execute<RowDataPacket[]>("SELECT id FROM employees WHERE account_user_id = ? LIMIT 1", [accountId]); return rows[0]?.id as string | undefined; }

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const admin = session.role === "admin" || session.role === "superadmin";
  // 支持 ?date=YYYY-MM-DD 过滤（小程序今日考勤）
  const date = request.nextUrl.searchParams.get("date") || "";
  const dateFilter = date ? " AND ar.work_date = ?" : "";
  let sql = "SELECT ar.id, ar.employee_id AS userId, e.name AS employeeName, DATE_FORMAT(ar.work_date, '%Y-%m-%d') AS date, TIME_FORMAT(ar.clock_in, '%H:%i:%s') AS clockIn, TIME_FORMAT(ar.clock_out, '%H:%i:%s') AS clockOut, ar.status, ar.work_type AS type, ar.location_lat AS locationLat, ar.location_lng AS locationLng FROM attendance_records ar LEFT JOIN employees e ON e.id = ar.employee_id";
  if (admin) {
    sql += dateFilter + " ORDER BY ar.work_date DESC, ar.created_at DESC";
  } else {
    sql += " WHERE ar.employee_id = ?" + dateFilter + " ORDER BY ar.work_date DESC";
  }
  const params: (string | number)[] = [];
  const emp = admin ? undefined : await employeeId(session.id);
  if (!admin) params.push(emp || "");
  if (date) params.push(date);
  const [rows] = await getDb().execute<RowDataPacket[]>(sql, params);
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

  const { action, workType, location } = await request.json() as {
    action?: string;
    workType?: string;
    location?: { lat?: number; lng?: number } | null;
  };
  const db = getDb();

  if (action === "clockIn") {
    // 上班打卡：位置范围校验（未提供 location 时跳过校验，兼容 mock/无法定位场景）
    const lat = typeof location?.lat === "number" ? location.lat : undefined;
    const lng = typeof location?.lng === "number" ? location.lng : undefined;
    const error = validateLocation(lat, lng);
    if (error) {
      return NextResponse.json({ message: error }, { status: 400 });
    }
    const id = `attendance-${Date.now()}-${randomBytes(3).toString("hex")}`;
    const type = workType === "remote" ? "remote" : "office";
    // 记录经纬度（位置仅记录首次打卡）
    await db.execute(
      `INSERT INTO attendance_records (id, employee_id, work_date, clock_in, status, work_type, location_lat, location_lng)
       VALUES (?, ?, CURDATE(), CURTIME(), IF(CURTIME() >= '09:00:00', 'late', 'normal'), ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         clock_in = COALESCE(clock_in, VALUES(clock_in)),
         status = IF(clock_in IS NULL AND CURTIME() >= '09:00:00', 'late', status),
         location_lat = COALESCE(location_lat, VALUES(location_lat)),
         location_lng = COALESCE(location_lng, VALUES(location_lng))`,
      [id, employee, type, lat ?? null, lng ?? null]
    );
  } else if (action === "clockOut") {
    await db.execute("UPDATE attendance_records SET clock_out = COALESCE(clock_out, CURTIME()) WHERE employee_id = ? AND work_date = CURDATE()", [employee]);
  } else return NextResponse.json({ message: "打卡动作无效" }, { status: 400 });

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT DATE_FORMAT(work_date, '%Y-%m-%d') AS date,
            TIME_FORMAT(clock_in, '%H:%i:%s') AS clockIn,
            TIME_FORMAT(clock_out, '%H:%i:%s') AS clockOut,
            status, work_type AS type, location_lat AS locationLat, location_lng AS locationLng
     FROM attendance_records WHERE employee_id = ? AND work_date = CURDATE()`,
    [employee]
  );
  return NextResponse.json({ record: rows[0] });
}
