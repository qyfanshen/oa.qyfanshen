"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type Conversation = {
  id: string;
  type: "private" | "group";
  name: string | null;
  lastMessage: string | null;
  lastTime: string | null;
  unread: number;
};

type ChatUser = {
  userId: number;
  name: string;
  department: string | null;
  position: string | null;
};

type Message = {
  id: string;
  conversationId: string;
  senderId: number;
  senderName: string;
  type: "text" | "image" | "file" | "system";
  content: string;
  fileName: string | null;
  fileSize: number | null;
  fileUrl: string | null;
  recalled: boolean;
  createdAt: string;
};

function fmtTime(t: string | null): string {
  if (!t) return "";
  const d = new Date(t.replace(/-/g, "/"));
  if (isNaN(d.getTime())) return t;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (sameDay) return hhmm;
  return `${d.getMonth() + 1}/${d.getDate()} ${hhmm}`;
}

function fileSizeText(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function isWithin5Min(iso: string): boolean {
  if (!iso) return false;
  const t = new Date(iso.replace(/-/g, "/"));
  return Date.now() - t.getTime() <= 5 * 60 * 1000;
}

export default function ChatPage() {
  const searchParams = useSearchParams();
  const [myId, setMyId] = useState<number | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [text, setText] = useState("");
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchUser, setSearchUser] = useState("");
  const [sending, setSending] = useState(false);
  const [unreadTotal, setUnreadTotal] = useState(0);
  // 消息操作菜单
  const [actionMsg, setActionMsg] = useState<Message | null>(null);
  const [actionMenuPos, setActionMenuPos] = useState<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 获取 token（通过 /api/auth/me 拿不到 token，改用 cookie 兼容：WS 用 cookie 鉴权）
  const getWsUrl = useCallback(() => {
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    const port = location.port;
    // 本地开发（3000 端口）直连 WS 服务 3002；生产走 Nginx 同域 /chat-ws 反代
    if (port === "3000") {
      return `${scheme}//${location.hostname}:3002/chat-ws`;
    }
    return `${scheme}//${location.host}/chat-ws`;
  }, []);

  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/chat/conversations", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setConversations(data.conversations || []);
      setUnreadTotal((data.conversations || []).reduce((a: number, c: Conversation) => a + c.unread, 0));
    }
  }, []);

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/chat/users", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users || []);
    }
  }, []);

  const loadMessages = useCallback(
    async (conversationId: string) => {
      const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setActiveId(conversationId);
        // 标记已读
        fetch(`/api/chat/conversations/${conversationId}/read`, { method: "POST" }).catch(() => {});
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c))
        );
        setUnreadTotal((u) => Math.max(0, u - (conversations.find((c) => c.id === conversationId)?.unread || 0)));
      }
    },
    [conversations]
  );

  // 初始：加载会话列表 + 用户列表 + 连接 WS
  useEffect(() => {
    loadConversations();
    loadUsers();

    // 获取当前用户 id
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setMyId(d?.user?.id ?? null))
      .catch(() => {});

    const socket = new WebSocket(getWsUrl());
    socket.onopen = () => console.log("[chat] WS 已连接");
    socket.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "new_message" && data.message) {
          const msg: Message = data.message;
          // 如果正在看这个会话，追加消息并标记已读
          if (msg.conversationId === activeIdRef.current) {
            setMessages((prev) => [...prev, msg]);
            fetch(`/api/chat/conversations/${msg.conversationId}/read`, { method: "POST" }).catch(() => {});
          } else {
            setUnreadTotal((u) => u + 1);
          }
          // 刷新会话列表（更新最后消息/未读）
          loadConversations();
        } else if (data.type === "message_recalled" && data.message) {
          // 撤回：替换内容为占位
          const m = data.message;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, recalled: true, content: m.content } : x)));
        } else if (data.type === "message_deleted" && data.messageId) {
          // 删除：直接从列表移除
          setMessages((prev) => prev.filter((x) => x.id !== data.messageId));
          loadConversations();
        } else if (data.type === "unread_count") {
          setUnreadTotal(Number(data.count || 0));
        }
      } catch {}
    };
    setWs(socket);
    return () => socket.close();
  }, [getWsUrl, loadConversations, loadUsers]);

  // 保持 activeId 的 ref（供 ws 回调使用）
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeId]);

  // URL 参数打开指定会话
  useEffect(() => {
    const cid = searchParams.get("conversation");
    if (cid) loadMessages(cid);
  }, [searchParams, loadMessages]);

  const openConversation = (id: string) => {
    setActiveId(id);
    loadMessages(id);
  };

  const startChatWith = async (u: ChatUser) => {
    setShowNewChat(false);
    // 调用 messages POST 不带 content，后端只创建/查找私聊会话，不发占位消息
    const res = await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: u.userId, type: "text" }),
    });
    if (res.ok) {
      const data = await res.json();
      loadConversations();
      loadMessages(data.conversationId);
    }
  };

  const sendMessage = async (type: "text" | "image" | "file", content: string, extra?: any) => {
    if (!activeId || sending) return;
    if (!content.trim()) return;
    setSending(true);
    try {
      // 不再乐观 push，统一由 WS onmessage 接收（包括自己发的消息也会回显）
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeId,
          type,
          content,
          ...extra,
        }),
      });
      if (res.ok) {
        setText("");
        // 不刷新会话列表——WS 收到消息时会 loadConversations
      }
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !activeId) return;
    const fd = new FormData();
    fd.append("file", file);
    const up = await fetch("/api/chat/upload", { method: "POST", body: fd });
    if (!up.ok) {
      alert("文件上传失败");
      return;
    }
    const data = await up.json();
    await sendMessage(data.type, data.type === "image" ? `[图片] ${data.fileName}` : `[文件] ${data.fileName}`, {
      fileName: data.fileName,
      fileSize: data.fileSize,
      fileUrl: data.url,
    });
  };

  const filteredUsers = users.filter((u) => {
    const q = searchUser.trim().toLowerCase();
    if (!q) return true;
    return (u.name || "").toLowerCase().includes(q) || (u.department || "").toLowerCase().includes(q);
  });

  // 撤回消息（5 分钟内）
  const handleRecall = async (msg: Message) => {
    setActionMsg(null);
    setActionMenuPos(null);
    const res = await fetch(`/api/chat/messages/${msg.id}/recall`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.message || "撤回失败");
      return;
    }
    // 乐观更新
    setMessages((prev) => prev.map((x) => (x.id === msg.id ? { ...x, recalled: true, content: "此消息已撤回" } : x)));
  };

  // 删除消息
  const handleDelete = async (msg: Message) => {
    setActionMsg(null);
    setActionMenuPos(null);
    if (!confirm("确定删除这条消息？删除后不可恢复")) return;
    const res = await fetch(`/api/chat/messages/${msg.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.message || "删除失败");
      return;
    }
    setMessages((prev) => prev.filter((x) => x.id !== msg.id));
    loadConversations();
  };

  // 关闭操作菜单（点击其他区域）
  useEffect(() => {
    if (!actionMsg) return;
    const close = () => {
      setActionMsg(null);
      setActionMenuPos(null);
    };
    const t = setTimeout(() => {
      document.addEventListener("click", close, { once: true });
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", close);
    };
  }, [actionMsg]);

  return (
    <div className="flex h-[calc(100dvh-7rem)] overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* 左侧：会话列表 */}
      <div className="flex w-64 sm:w-72 shrink-0 flex-col border-r border-gray-100 bg-gray-50/60">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">消息</h2>
          <button
            onClick={() => {
              setShowNewChat(true);
              loadUsers();
            }}
            className="p-1.5 rounded-lg text-[#1e3a5f] hover:bg-gray-100 transition-colors"
            title="发起新聊天"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-gray-400">
              暂无会话
              <br />
              <span className="mt-2 inline-block text-[#1e3a5f]">点右上角 + 发起聊天</span>
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => openConversation(c.id)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  activeId === c.id ? "bg-blue-50/70" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-gray-800">
                    {c.type === "group" ? "👥 " : ""}{c.name}
                  </span>
                  {c.unread > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] leading-[18px] font-semibold text-center">
                      {c.unread > 99 ? "99+" : c.unread}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-gray-400">{c.lastMessage || "暂无消息"}</span>
                  <span className="shrink-0 text-[10px] text-gray-300">{fmtTime(c.lastTime)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 右侧：聊天窗口 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!activeId ? (
          <div className="flex flex-1 flex-col items-center justify-center text-gray-300">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="mt-3 text-sm">选择一个会话开始聊天</p>
          </div>
        ) : (
          <>
            {/* 聊天头部 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-800">
                {conversations.find((c) => c.id === activeId)?.name || "聊天"}
              </span>
              <span className="text-xs text-gray-400">
                {conversations.find((c) => c.id === activeId)?.type === "group" ? "部门群聊" : "私聊"}
              </span>
            </div>

            {/* 消息区 */}
            <div ref={bottomRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50/40">
              {messages.map((m) => {
                const mine = m.senderId === myId;
                const canRecall = mine && !m.recalled && isWithin5Min(m.createdAt);
                const canDelete = mine; // 撤回/删除都限制为发送者（管理员模式扩展时再放开）
                return (
                  <div
                    key={m.id}
                    className={`flex ${mine ? "justify-end" : "justify-start"} gap-2 group`}
                  >
                    <div className={`max-w-[70%] ${mine ? "order-1" : ""}`}>
                      {!mine && m.type !== "system" && (
                        <p className="mb-1 text-[10px] text-gray-400">{m.senderName}</p>
                      )}
                      <div
                        className={`rounded-2xl px-3.5 py-2 text-sm break-words relative ${
                          m.type === "system"
                            ? "mx-auto text-center text-xs text-gray-400 bg-transparent"
                            : m.recalled
                            ? "bg-gray-100 text-gray-400 italic rounded-md border border-gray-200 cursor-default"
                            : mine
                            ? "bg-[#1e3a5f] text-white rounded-br-md cursor-pointer"
                            : "bg-white text-gray-800 border border-gray-100 rounded-bl-md cursor-pointer"
                        }`}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (!m.recalled && (canRecall || canDelete)) {
                            setActionMenuPos({ x: e.clientX, y: e.clientY });
                            setActionMsg(m);
                          }
                        }}
                        onTouchStart={(e) => {
                          if (m.recalled || (!canRecall && !canDelete)) return;
                          const touch = e.touches[0];
                          longPressTimer.current = setTimeout(() => {
                            setActionMenuPos({ x: touch.clientX, y: touch.clientY });
                            setActionMsg(m);
                          }, 500);
                        }}
                        onTouchEnd={() => {
                          if (longPressTimer.current) clearTimeout(longPressTimer.current);
                        }}
                        onTouchMove={() => {
                          if (longPressTimer.current) clearTimeout(longPressTimer.current);
                        }}
                      >
                        {m.recalled ? (
                          <span className="text-gray-400">此消息已撤回</span>
                        ) : m.type === "image" && m.fileUrl ? (
                          <img
                            src={m.fileUrl}
                            alt={m.fileName || "图片"}
                            className="max-w-[220px] rounded-lg cursor-pointer"
                            onClick={() => window.open(m.fileUrl!, "_blank")}
                          />
                        ) : m.type === "file" && m.fileUrl ? (
                          <a
                            href={m.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 hover:underline"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                              <polyline points="13 2 13 9 20 9" />
                            </svg>
                            <span>{m.fileName || "文件"}</span>
                            <span className="text-[10px] opacity-60">{fileSizeText(m.fileSize)}</span>
                          </a>
                        ) : (
                          <span>{m.content}</span>
                        )}
                      </div>
                      <p className={`mt-0.5 text-[10px] text-gray-300 ${mine ? "text-right" : ""}`}>{fmtTime(m.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* 输入区 */}
            <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-white">
              <label className="shrink-0 p-2 text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-50 rounded-lg cursor-pointer transition-colors" title="发送文件/图片">
                <input type="file" className="hidden" onChange={handleFileUpload} />
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </label>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage("text", text);
                  }
                }}
                placeholder="输入消息，回车发送"
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#1e3a5f] focus:ring-2 focus:ring-[#1e3a5f]/10"
              />
              <button
                onClick={() => sendMessage("text", text)}
                disabled={!text.trim() || sending}
                className="shrink-0 rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm text-white disabled:opacity-40 hover:bg-[#2a4a73] transition-colors"
              >
                发送
              </button>
            </div>
          </>
        )}
      </div>

      {/* 消息操作菜单（撤回/删除） */}
      {actionMsg && actionMenuPos && (
        <div
          className="fixed z-50 min-w-[140px] rounded-lg bg-white py-1 shadow-xl border border-gray-200"
          style={{ left: Math.min(actionMenuPos.x, window.innerWidth - 160), top: Math.min(actionMenuPos.y, window.innerHeight - 100) }}
          onClick={(e) => e.stopPropagation()}
        >
          {actionMsg.senderId === myId && isWithin5Min(actionMsg.createdAt) && !actionMsg.recalled && (
            <button
              onClick={() => handleRecall(actionMsg)}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              撤回消息
            </button>
          )}
          {actionMsg.senderId === myId && (
            <button
              onClick={() => handleDelete(actionMsg)}
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              删除消息
            </button>
          )}
          <button
            onClick={() => {
              setActionMsg(null);
              setActionMenuPos(null);
            }}
            className="w-full px-4 py-2 text-left text-sm text-gray-500 hover:bg-gray-50 transition-colors border-t border-gray-100"
          >
            取消
          </button>
        </div>
      )}

      {/* 新建聊天弹窗 */}
      {showNewChat && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setShowNewChat(false)}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-800">发起新聊天</h3>
            <input
              value={searchUser}
              onChange={(e) => setSearchUser(e.target.value)}
              placeholder="搜索姓名 / 部门"
              className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#1e3a5f]"
            />
            <div className="mt-3 max-h-64 overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <p className="py-8 text-center text-xs text-gray-400">没有找到同事</p>
              ) : (
                filteredUsers.map((u) => (
                  <button
                    key={u.userId}
                    onClick={() => startChatWith(u)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-[#0ea5e9] flex items-center justify-center text-white text-sm font-medium shrink-0">
                      {u.name?.charAt(0)}
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="text-sm font-medium text-gray-800">{u.name}</p>
                      <p className="text-xs text-gray-400">{u.department} · {u.position}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
