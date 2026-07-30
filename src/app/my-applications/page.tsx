"use client";

import { FormEvent, useEffect, useState } from "react";
import type { ApprovalRequest } from "@/types";

// 申请类型标签配置
const approvalTypeMeta: Record<string, { label: string; bg: string; text: string }> = {
  leave:     { label: "请假申请", bg: "bg-blue-50",  text: "text-blue-600" },
  expense:   { label: "费用报销", bg: "bg-emerald-50", text: "text-emerald-600" },
  travel:    { label: "出差申请", bg: "bg-indigo-50",  text: "text-indigo-600" },
  purchase:  { label: "采购申请", bg: "bg-purple-50", text: "text-purple-600" },
  contract:  { label: "合同申请", bg: "bg-orange-50", text: "text-orange-600" },
  seal:      { label: "用章申请", bg: "bg-yellow-50",  text: "text-yellow-600" },
  other:     { label: "其他申请", bg: "bg-gray-50",   text: "text-gray-500" },
};

const submitTypes = [
  { value: "other",     label: "一般申请" },
  { value: "travel",    label: "出差申请" },
  { value: "purchase",  label: "采购申请" },
  { value: "contract",  label: "合同申请" },
  { value: "seal",      label: "用章申请" },
];

const statusMap: Record<string, string> = {
  pending: "待审批",
  processing: "审批中",
  approved: "已通过",
  rejected: "已驳回",
};

const statusBadge: Record<string, { bg: string; text: string }> = {
  pending:    { bg: "bg-amber-50",    text: "text-amber-700" },
  processing: { bg: "bg-blue-50",    text: "text-blue-700" },
  approved:   { bg: "bg-emerald-50", text: "text-emerald-700" },
  rejected:   { bg: "bg-red-50",     text: "text-red-600" },
};

type FilterTab = "all" | "leave" | "expense" | "other";

interface LeaveRecord {
  id: string;
  userId: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: string;
  createdAt: string;
  applicantName?: string;
}

export default function MyApplicationsPage() {
  const [form, setForm] = useState({ type: "other", title: "", content: "", amount: "" });
  const [approvalItems, setApprovalItems] = useState<ApprovalRequest[]>([]);
  const [leaveItems, setLeaveItems] = useState<LeaveRecord[]>([]);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");

  // 加载申请记录
  useEffect(() => {
    // 并行拉取两个接口，确保请假记录展示
    Promise.all([
      fetch("/api/approvals").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/leave").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([approvalData, leaveData]) => {
      if (approvalData?.approvals) setApprovalItems(approvalData.approvals);
      if (leaveData?.records) setLeaveItems(leaveData.records);
    });
  }, []);

  // 合并展示：expense/other 类型 → approvalItems；leave 类型 → leaveItems（按时间降序）
  const allRecords = [
    ...approvalItems
      .filter((item) => item.type !== "leave")
      .map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        content: item.content,
        status: item.status,
        amount: item.amount,
        createdAt: item.createdAt,
        from: "approval" as const,
      })),
    ...leaveItems.map((item) => ({
      id: item.id,
      type: "leave",
      title: item.type === "annual" ? "年假申请" : item.type === "sick" ? "病假申请" : item.type === "personal" ? "事假申请" : "请假申请",
      content: `${item.startDate} 至 ${item.endDate}，共 ${item.days} 天${item.reason ? "：" + item.reason : ""}`,
      status: item.status,
      amount: undefined,
      createdAt: item.createdAt,
      from: "leave" as const,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const filtered = allRecords.filter((item) => {
    if (filter === "all") return true;
    if (filter === "leave") return item.type === "leave";
    if (filter === "expense") return item.type === "expense" || item.type === "travel";
    if (filter === "other") return !["leave", "expense", "travel"].includes(item.type);
    return true;
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim() || !form.content.trim()) return;
    const amount = Number(form.amount);
    const payload = {
      type: form.type,
      title: form.title.trim(),
      content: form.content.trim(),
      amount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
    };
    const response = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);

    if (response?.ok) {
      setForm({ type: "other", title: "", content: "", amount: "" });
      setNotice("申请已提交，等待管理员审核。");
      // 刷新列表
      const [approvalData, leaveData] = await Promise.all([
        fetch("/api/approvals").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/leave").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (approvalData?.approvals) setApprovalItems(approvalData.approvals);
      if (leaveData?.records) setLeaveItems(leaveData.records);
    } else {
      setNotice("提交失败，请检查网络后重试。");
    }
    setTimeout(() => setNotice(""), 4000);
  }

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all",     label: "全部" },
    { key: "leave",   label: "请假" },
    { key: "expense", label: "报销" },
    { key: "other",   label: "其他" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* 标题区 */}
      <div>
        <h2 className="text-xl font-bold text-gray-800">我的申请</h2>
        <p className="mt-1 text-sm text-gray-400">提交申请后由管理员统一审核，审核结果会显示在这里。</p>
      </div>

      {/* 成功提示 */}
      {notice && (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* 左侧：提交表单 */}
        <form
          onSubmit={submit}
          className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-2"
        >
          <h3 className="mb-4 font-semibold text-gray-800">提交新申请</h3>
          <div className="space-y-4">
            <label className="block text-sm text-gray-600">
              申请类型
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2"
              >
                {submitTypes.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-gray-600">
              申请标题
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="例如：年假申请、外出拜访客户"
                className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm text-gray-600">
              申请内容
              <textarea
                required
                rows={5}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="请写清楚申请事项、原因和需要审批的内容"
                className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm text-gray-600">
              金额（可选）
              <input
                type="number"
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-lg bg-[#1e3a5f] px-4 py-2.5 text-sm font-medium text-white"
            >
              提交申请
            </button>
          </div>
        </form>

        {/* 右侧：申请记录 */}
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-3">
          {/* 过滤标签栏 */}
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm font-medium text-gray-600">筛选：</span>
            {tabs.map((tab) => {
              const count =
                tab.key === "all"
                  ? allRecords.length
                  : tab.key === "leave"
                  ? allRecords.filter((r) => r.type === "leave").length
                  : tab.key === "expense"
                  ? allRecords.filter((r) => r.type === "expense" || r.type === "travel").length
                  : allRecords.filter((r) => !["leave", "expense", "travel"].includes(r.type)).length;
              return (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    filter === tab.key
                      ? "bg-[#1e3a5f] text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {tab.label} {count > 0 && `(${count})`}
                </button>
              );
            })}
          </div>

          {/* 记录列表 */}
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">暂无申请记录</div>
            ) : (
              filtered.map((item) => {
                const meta = approvalTypeMeta[item.type] ?? approvalTypeMeta.other;
                const sBadge = statusBadge[item.status] ?? statusBadge.pending;
                return (
                  <div key={item.id} className="rounded-lg border border-gray-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {/* 类型标签 + 标题 */}
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${meta.bg} ${meta.text}`}>
                            {meta.label}
                          </span>
                          <span className="font-medium text-gray-800">{item.title}</span>
                        </div>
                        <p className="text-sm text-gray-500">{item.content}</p>
                        <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                          <span>{item.createdAt}</span>
                          {item.amount != null && (
                            <span className="text-amber-600">¥{item.amount.toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${sBadge.bg} ${sBadge.text}`}>
                        {statusMap[item.status]}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
