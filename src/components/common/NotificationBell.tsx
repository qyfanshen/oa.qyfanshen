"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type NotificationItem = {
  id: number;
  type: string;
  title: string;
  content: string | null;
  relatedUrl: string | null;
  relatedId: string | null;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  approval_pending: "审批",
  approval_approved: "审批",
  approval_rejected: "审批",
  leave: "请假",
  expense: "报销",
  seal: "用章",
  document: "文档",
  announcement: "公告",
  system: "系统",
};

const TYPE_COLOR: Record<string, string> = {
  approval_pending: "bg-amber-100 text-amber-700",
  approval_approved: "bg-emerald-100 text-emerald-700",
  approval_rejected: "bg-rose-100 text-rose-700",
  leave: "bg-sky-100 text-sky-700",
  expense: "bg-violet-100 text-violet-700",
  seal: "bg-red-100 text-red-700",
  document: "bg-blue-100 text-blue-700",
  announcement: "bg-orange-100 text-orange-700",
  system: "bg-slate-100 text-slate-700",
};

function timeAgo(iso: string): string {
  if (!iso) return "";
  const date = iso.replace(/-/g, "/");
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day} 天前`;
  return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [allRead, setAllRead] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUnread(Number(data.count || 0));
      }
    } catch {}
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=20", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setItems(data.notifications || []);
        setAllRead((data.notifications || []).every((n: NotificationItem) => n.isRead));
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  // 轮询未读数（30s 一次）
  useEffect(() => {
    fetchUnread();
    const t = setInterval(fetchUnread, 30000);
    return () => clearInterval(t);
  }, [fetchUnread]);

  // 打开下拉时拉取列表
  useEffect(() => {
    if (open) {
      fetchList();
    }
  }, [open, fetchList]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleItemClick = async (n: NotificationItem) => {
    if (!n.isRead) {
      fetch(`/api/notifications/${n.id}`, { method: "PATCH" }).catch(() => {});
      // 乐观更新
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setUnread((c) => Math.max(0, c - 1));
    }
    if (n.relatedUrl) {
      setOpen(false);
      router.push(n.relatedUrl);
    }
  };

  const handleReadAll = async () => {
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
      setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
      setUnread(0);
      setAllRead(true);
    } catch {}
  };

  const handleViewAll = () => {
    setOpen(false);
    router.push("/notifications");
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative p-2 text-gray-500 hover:text-[#1e3a5f] hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="通知"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] leading-[18px] font-semibold text-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-h-[70vh] flex flex-col rounded-xl border border-gray-200 bg-white shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
            <h3 className="text-sm font-semibold text-gray-800">通知</h3>
            {items.some((i) => !i.isRead) && (
              <button
                type="button"
                onClick={handleReadAll}
                className="text-xs text-[#1e3a5f] hover:underline"
              >
                全部已读
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-gray-400">加载中…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-gray-400">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 text-gray-300">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                暂无通知
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleItemClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors hover:bg-gray-50 flex gap-3 ${
                    !n.isRead ? "bg-[#fff8e6]" : ""
                  }`}
                >
                  <span
                    className={`mt-1 inline-flex items-center justify-center w-9 h-9 rounded-lg text-xs font-medium shrink-0 ${
                      TYPE_COLOR[n.type] || "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {TYPE_LABEL[n.type] || "通知"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`truncate text-sm ${n.isRead ? "text-gray-600" : "text-gray-900 font-medium"}`}>
                        {n.title}
                      </p>
                      {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                    </div>
                    {n.content && (
                      <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{n.content}</p>
                    )}
                    <p className="mt-1 text-[11px] text-gray-400">{timeAgo(n.createdAt)}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="px-4 py-2 border-t border-gray-100 shrink-0">
            <button
              type="button"
              onClick={handleViewAll}
              className="w-full text-center text-xs text-gray-500 hover:text-[#1e3a5f] py-1"
            >
              查看全部
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
