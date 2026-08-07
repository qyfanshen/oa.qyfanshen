import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import {
  findOrCreatePrivateConversation,
  findOrCreateDepartmentGroup,
  insertMessage,
  getMessageById,
} from "@/lib/chat";

export const runtime = "nodejs";

// POST /api/chat/messages
// body: { conversationId?: string, targetUserId?: number, department?: string, type: 'text'|'image'|'file', content, fileName?, fileSize?, fileUrl? }
// 返回消息对象 + conversationId
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "请求格式不正确" }, { status: 400 });
  }

  // 解析会话
  let conversationId = body.conversationId;
  let createdEmpty = false;
  if (!conversationId && body.targetUserId) {
    conversationId = await findOrCreatePrivateConversation(session.id, Number(body.targetUserId));
    createdEmpty = true;
  } else if (!conversationId && body.department) {
    const gid = await findOrCreateDepartmentGroup(String(body.department));
    if (!gid) return NextResponse.json({ message: "该部门暂无可聊天成员" }, { status: 400 });
    conversationId = gid;
    createdEmpty = true;
  }
  if (!conversationId) return NextResponse.json({ message: "缺少会话或目标" }, { status: 400 });

  const type = ["text", "image", "file", "system"].includes(body.type) ? body.type : "text";
  const content = typeof body.content === "string" ? body.content : "";

  // 首次发起聊天：仅创建/查找会话，不发空消息
  if (createdEmpty && !content.trim()) {
    return NextResponse.json({ conversationId, message: null }, { status: 200 });
  }
  if (type === "text" && !content.trim()) {
    return NextResponse.json({ message: "消息内容不能为空" }, { status: 400 });
  }

  const msg = await insertMessage({
    conversationId,
    senderId: session.id,
    type,
    content,
    fileName: body.fileName ?? null,
    fileSize: body.fileSize ?? null,
    fileUrl: body.fileUrl ?? null,
  });

  // 通过 WebSocket 实时推送给会话所有成员（含发送者自己，避免前端做乐观 push）
  pushToWs(conversationId, msg);

  return NextResponse.json({ message: msg, conversationId }, { status: 201 });
}

/** 通知 WS 服务推送新消息（HTTP → WS 桥接） */
function pushToWs(conversationId: string, msg: any) {
  const wsPort = process.env.CHAT_WS_PORT || "3002";
  const url = `http://127.0.0.1:${wsPort}/bridge`;
  try {
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, message: msg }),
      signal: AbortSignal.timeout(3000),
    }).catch(() => {});
  } catch {
    // 忽略，消息已落库
  }
}
