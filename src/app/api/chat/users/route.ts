import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getSessionFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/chat/users  可聊天人员列表（含部门分组信息）
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  const [rows] = await getDb().execute<RowDataPacket[]>(
    `SELECT u.id AS userId, u.name, e.department, e.position
     FROM users u
     LEFT JOIN employees e ON e.account_user_id = u.id
     WHERE u.status = 'active' AND u.id != ?
     ORDER BY e.department, u.name`,
    [session.id]
  );
  return NextResponse.json({ users: rows });
}
