import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getSessionFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/notifications?limit=20&unread=true
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 20), 1), 100);
  const unreadOnly = request.nextUrl.searchParams.get("unread") === "true";

  const where: string[] = ["recipient_id = ?"];
  const params: (string | number)[] = [session.id];
  if (unreadOnly) where.push("is_read = 0");

  const sql = `SELECT id, type, title, content, related_url AS relatedUrl, related_id AS relatedId,
                       is_read AS isRead, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
                       DATE_FORMAT(read_at, '%Y-%m-%d %H:%i:%s') AS readAt
               FROM notifications WHERE ${where.join(" AND ")}
               ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const [rows] = await getDb().query<RowDataPacket[]>(sql, params);
  return NextResponse.json({
    notifications: rows.map((r) => ({ ...r, isRead: Boolean(r.isRead) })),
  });
}
