import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getSessionFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/notifications/unread-count
export async function GET(_request: NextRequest) {
  const session = await getSessionFromRequest(_request);
  if (!session) return NextResponse.json({ count: 0 });

  const [rows] = await getDb().execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS cnt FROM notifications WHERE recipient_id = ? AND is_read = 0",
    [session.id]
  );
  return NextResponse.json({ count: Number(rows[0]?.cnt || 0) });
}
