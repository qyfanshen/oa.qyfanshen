import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { markConversationRead } from "@/lib/chat";

export const runtime = "nodejs";

// POST /api/chat/conversations/:id/read 标记已读
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const { id } = await params;
  await markConversationRead(id, session.id);
  return NextResponse.json({ ok: true });
}
