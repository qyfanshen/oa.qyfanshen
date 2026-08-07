import { NextRequest, NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2";
import { getSessionFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

// PATCH /api/notifications/[id]  标记单条已读
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  const { id } = await params;
  const [result] = await getDb().execute<ResultSetHeader>(
    "UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND recipient_id = ? AND is_read = 0",
    [id, session.id]
  );
  return NextResponse.json({ updated: result.affectedRows > 0 });
}
