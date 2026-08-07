import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getMessageForAction, deleteMessage } from "@/lib/chat";
import { getDb } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

export const runtime = "nodejs";

// DELETE /api/chat/messages/[id]  物理删除消息（仅发送者或超管）
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(_request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  const { id } = await params;
  const msg = await getMessageForAction(id);
  if (!msg) return NextResponse.json({ message: "消息不存在" }, { status: 404 });

  // 权限：仅发送者本人或 superadmin/admin
  let isAdmin = session.role === "admin" || session.role === "superadmin";
  if (!isAdmin && msg.senderId !== session.id) {
    return NextResponse.json({ message: "无权删除此消息" }, { status: 403 });
  }

  const ok = await deleteMessage(id);
  if (!ok) return NextResponse.json({ message: "删除失败" }, { status: 500 });

  // 通过 WS 广播删除事件
  pushWsEvent(msg.conversationId, { type: "message_deleted", messageId: id });

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
