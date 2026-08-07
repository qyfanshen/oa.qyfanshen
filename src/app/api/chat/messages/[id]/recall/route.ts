import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getMessageForAction, recallMessage, withinRecallWindow } from "@/lib/chat";

export const runtime = "nodejs";

// POST /api/chat/messages/[id]/recall  撤回消息（5 分钟内）
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(_request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  const { id } = await params;
  const msg = await getMessageForAction(id);
  if (!msg) return NextResponse.json({ message: "消息不存在" }, { status: 404 });
  if (msg.senderId !== session.id) {
    return NextResponse.json({ message: "只能撤回自己的消息" }, { status: 403 });
  }
  if (msg.recalled) {
    return NextResponse.json({ message: "消息已撤回" }, { status: 400 });
  }
  if (!withinRecallWindow(msg.createdAt)) {
    return NextResponse.json({ message: "超过 5 分钟无法撤回" }, { status: 400 });
  }

  const ok = await recallMessage(id);
  if (!ok) return NextResponse.json({ message: "撤回失败" }, { status: 500 });

  // 通过 WS 广播撤回事件（推送更新后的消息对象）
  pushWsEvent(msg.conversationId, {
    type: "message_recalled",
    message: {
      id,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      type: msg.type,
      content: "此消息已撤回",
      fileName: null,
      fileSize: null,
      fileUrl: null,
      recalled: true,
      createdAt: msg.createdAt,
    },
  });

  return NextResponse.json({ ok: true, messageId: id });
}

function pushWsEvent(conversationId: string, payload: any) {
  const wsPort = process.env.CHAT_WS_PORT || "3002";
  const url = `http://127.0.0.1:${wsPort}/bridge`;
  try {
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, event: payload }),
      signal: AbortSignal.timeout(3000),
    }).catch(() => {});
  } catch {}
}
