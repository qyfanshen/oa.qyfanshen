"use client";

import { useEffect, useState, useMemo } from "react";
import type { ApprovalRequest } from "@/types";

const typeLabels: Record<string, string> = {
  expense: "报销", leave: "请假", travel: "差旅", seal: "用章",
  contract: "合同", purchase: "采购", other: "其他",
};
const typeColors: Record<string, string> = {
  expense: "bg-orange-100 text-orange-700",
  leave: "bg-purple-100 text-purple-700",
  travel: "bg-blue-100 text-blue-700",
  seal: "bg-cyan-100 text-cyan-700",
  contract: "bg-violet-100 text-violet-700",
  purchase: "bg-rose-100 text-rose-700",
  other: "bg-gray-100 text-gray-600",
};
const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  processing: "bg-blue-100 text-blue-700",
};
const statusLabels: Record<string, string> = {
  pending: "待审批",
  approved: "已通过",
  rejected: "已驳回",
  processing: "审批中",
};

export default function ApprovalsPage() {
  const [activeTab, setActiveTab] = useState<"pending" | "done">("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [items, setItems] = useState<ApprovalRequest[]>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const loadApprovals = async () => {
      const response = await fetch("/api/approvals", { cache: "no-store" }).catch(() => null);
      if (!response?.ok) return;
      const data = await response.json() as { approvals?: ApprovalRequest[] };
      if (data.approvals) setItems(data.approvals);
    };
    void loadApprovals();
    return undefined;
  }, []);

  const pendingItems = useMemo(
    () => items.filter((a) => a.status === "pending" || a.status === "processing"),
    [items]
  );
  const doneItems = useMemo(
    () => items.filter((a) => a.status === "approved" || a.status === "rejected"),
    [items]
  );

  const displayList = activeTab === "pending" ? pendingItems : doneItems;

  const handleDecision = async (id: string, decision: "approved" | "rejected") => {
    const target = items.find((item) => item.id === id);
    if (!target) return;
    const response = await fetch(`/api/approvals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: decision }),
    }).catch(() => null);
    if (!response?.ok) {
      setNotice("审批更新失败，请稍后重试。");
      window.setTimeout(() => setNotice(""), 2500);
      return;
    }
    const updatedAt = new Date().toLocaleString("zh-CN", { hour12: false });
    const nextItems: ApprovalRequest[] = items.map((item) => {
      if (item.id !== id) return item;
      const isFinalStep = item.currentStep >= item.steps.length - 1;
      return {
        ...item,
        status: (decision === "rejected" ? "rejected" : isFinalStep ? "approved" : "processing") as ApprovalRequest["status"],
        currentStep: decision === "approved" && !isFinalStep ? item.currentStep + 1 : item.currentStep,
        updatedAt,
        steps: item.steps.map((step) => step.order === item.currentStep
          ? { ...step, status: decision, approvedAt: updatedAt, comment: decision === "approved" ? "已通过" : "已驳回" }
          : step),
      };
    });
    setItems(nextItems);
    setNotice(decision === "approved" ? "审批已通过并更新流程" : "申请已驳回");
    window.setTimeout(() => setNotice(""), 2500);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">审批中心</h2>

      {notice && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab("pending")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "pending" ? "bg-white text-[#1e3a5f] shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          待审批 ({pendingItems.length})
        </button>
        <button
          onClick={() => setActiveTab("done")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "done" ? "bg-white text-[#1e3a5f] shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          已审批 ({doneItems.length})
        </button>
      </div>

      {/* Approval List */}
      <div className="space-y-3">
        {displayList.map((item) => {
          const applicantName = (item as ApprovalRequest & { applicantName?: string }).applicantName;
          const isExpanded = expandedId === item.id;
          return (
            <div
              key={item.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Summary Row */}
              <div
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
              >
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColors[item.type] || "bg-gray-100 text-gray-600"}`}>
                  {typeLabels[item.type] || item.type}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{item.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {applicantName || item.applicantId} · {item.createdAt}
                  </div>
                </div>
                {item.amount != null && (
                  <span className="text-sm font-semibold text-gray-700 shrink-0">¥{item.amount.toLocaleString()}</span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[item.status]}`}>
                  {statusLabels[item.status]}
                </span>
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className={`text-gray-400 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>

              {/* Expanded Detail */}
              {isExpanded && (
                <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/30 space-y-4">
                  <div>
                    <div className="text-xs text-gray-400 mb-1">申请内容</div>
                    <p className="text-sm text-gray-700">{item.content}</p>
                  </div>

                  {item.attachments && item.attachments.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-400 mb-2">证明附件</div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {item.attachments.map((file, index) => {
                          const isImage = file.type?.startsWith("image/");
                          return (
                            <a
                              key={`${item.id}-${file.url}-${index}`}
                              href={file.url}
                              target="_blank"
                              rel="noreferrer"
                              className="group rounded-lg border border-gray-200 bg-white p-3 transition hover:border-[#0ea5e9] hover:shadow-sm"
                            >
                              {isImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={file.url} alt={file.name} className="mb-2 h-24 w-full rounded-md object-cover" />
                              ) : (
                                <div className="mb-2 flex h-24 w-full items-center justify-center rounded-md bg-red-50 text-sm font-semibold text-red-500">PDF</div>
                              )}
                              <div className="truncate text-xs font-medium text-gray-700 group-hover:text-[#0ea5e9]">
                                {file.name || `附件${index + 1}`}
                              </div>
                              <div className="mt-1 text-[10px] text-gray-400">点击查看</div>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Approval Flow */}
                  <div>
                    <div className="text-xs text-gray-400 mb-2">审批流程</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.steps.map((step, idx) => (
                        <div key={step.order} className="flex items-center gap-2">
                          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                            step.status === "approved"
                              ? "bg-emerald-50 border-emerald-200"
                              : step.status === "rejected"
                              ? "bg-red-50 border-red-200"
                              : step.order === item.currentStep
                              ? "bg-amber-50 border-amber-200"
                              : "bg-white border-gray-200"
                          }`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                              step.status === "approved"
                                ? "bg-emerald-500 text-white"
                                : step.status === "rejected"
                                ? "bg-red-500 text-white"
                                : step.order === item.currentStep
                                ? "bg-amber-500 text-white"
                                : "bg-gray-200 text-gray-500"
                            }`}>
                              {step.status === "approved" ? "✓" : step.status === "rejected" ? "✗" : step.order + 1}
                            </div>
                            <div>
                              <div className="text-xs font-medium text-gray-700">{step.approverName}</div>
                              <div className="text-[10px] text-gray-400">
                                {step.status === "approved" ? "已通过" : step.status === "rejected" ? "已驳回" : "待审批"}
                              </div>
                            </div>
                          </div>
                          {idx < item.steps.length - 1 && (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300">
                              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                            </svg>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions for pending */}
                  {item.status !== "approved" && item.status !== "rejected" && (
                    <div className="flex gap-2 pt-2">
                      <button onClick={() => handleDecision(item.id, "approved")} className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors">
                        通过
                      </button>
                      <button onClick={() => handleDecision(item.id, "rejected")} className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors">
                        驳回
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {displayList.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 text-center text-gray-400 py-12">
            {activeTab === "pending" ? "暂无待审批项" : "暂无已审批记录"}
          </div>
        )}
      </div>
    </div>
  );
}
