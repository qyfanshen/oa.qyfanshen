import { NextRequest, NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2";
import { getSessionFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

// POST /api/notifications/read-all  标记全部已读
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  const [result] = await getDb().execute<ResultSetHeader>(
    "UPDATE notifications SET is_read = 1, read_at = NOW() WHERE recipient_id = ? AND is_read = 0",
    [session.id]
  );
  return NextResponse.json({ updated: result.affectedRows });
}
