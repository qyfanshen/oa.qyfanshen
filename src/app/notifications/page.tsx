"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
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
};

const TYPE_LABEL: Record<string, string> = {
  approval_pending: "待审批",
  approval_approved: "审批通过",
  approval_rejected: "审批驳回",
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

const TABS = [
  { key: "all", label: "全部" },
  { key: "unread", label: "未读" },
  { key: "approval", label: "审批相关" },
  { key: "system", label: "系统消息" },
];

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=100", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setItems(data.notifications || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const filtered = items.filter((n) => {
    if (activeTab === "all") return true;
    if (activeTab === "unread") return !n.isRead;
    if (activeTab === "approval") return n.type.startsWith("approval_");
    if (activeTab === "system") return n.type === "system" || n.type === "announcement";
    return true;
  });

  const handleItemClick = async (n: NotificationItem) => {
    if (!n.isRead) {
      fetch(`/api/notifications/${n.id}`, { method: "PATCH" }).catch(() => {});
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    }
    if (n.relatedUrl) router.push(n.relatedUrl);
  };

  const handleReadAll = async () => {
    await fetch("/api/notifications/read-all", { method: "POST" });
    setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
  };

  const unreadCount = items.filter((i) => !i.isRead).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#1e3a5f]">通知中心</h1>
          <p className="text-sm text-gray-500 mt-1">共 {items.length} 条，未读 {unreadCount}</p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleReadAll}
            className="text-sm px-4 py-2 rounded-lg border border-gray-200 hover:border-[#1e3a5f] hover:text-[#1e3a5f] transition-colors"
          >
            全部标记为已读
          </button>
        )}
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-[#1e3a5f] text-[#1e3a5f]"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="px-4 py-16 text-center text-sm text-gray-400">加载中…</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-gray-400">暂无通知</div>
        ) : (
          filtered.map((n) => (
            <button
              key={n.id}
              onClick={() => handleItemClick(n)}
              className={`w-full text-left px-5 py-4 border-b border-gray-50 last:border-0 transition-colors hover:bg-gray-50 flex gap-4 ${
                !n.isRead ? "bg-[#fff8e6]" : ""
              }`}
            >
              <span
                className={`inline-flex items-center justify-center min-w-[60px] h-8 px-2 rounded-md text-xs font-medium shrink-0 ${
                  TYPE_COLOR[n.type] || "bg-slate-100 text-slate-700"
                }`}
              >
                {TYPE_LABEL[n.type] || "通知"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={`text-sm ${n.isRead ? "text-gray-600" : "text-gray-900 font-medium"}`}>
                    {n.title}
                  </p>
                  {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                </div>
                {n.content && <p className="mt-1 text-sm text-gray-500 line-clamp-2">{n.content}</p>}
                <p className="mt-1.5 text-xs text-gray-400">{n.createdAt}</p>
              </div>
              {n.relatedUrl && (
                <span className="text-xs text-gray-400 self-center shrink-0">查看 →</span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
