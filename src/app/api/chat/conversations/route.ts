import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { listConversations } from "@/lib/chat";

export const runtime = "nodejs";

// GET /api/chat/conversations 会话列表（含未读数）
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const conversations = await listConversations(session.id);
  return NextResponse.json({ conversations });
}
