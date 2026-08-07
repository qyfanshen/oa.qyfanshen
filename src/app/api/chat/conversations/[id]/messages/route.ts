import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { conversationDetail, listMessages, markConversationRead } from "@/lib/chat";

export const runtime = "nodejs";

// GET /api/chat/conversations/:id/messages?before=xxx&limit=50
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  const { id } = await params;
  const detail = await conversationDetail(id, session.id);
  if (!detail) return NextResponse.json({ message: "会话不存在" }, { status: 404 });
  if (!detail.isMember) return NextResponse.json({ message: "无权访问该会话" }, { status: 403 });

  const before = request.nextUrl.searchParams.get("before") || undefined;
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 50), 1), 100);
  const messages = await listMessages(id, before, limit);
  return NextResponse.json({ messages, conversation: detail });
}
