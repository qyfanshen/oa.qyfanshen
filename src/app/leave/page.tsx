"use client";

import { useEffect, useMemo, useState } from "react";

type LeaveRecord = {
  id: string;
  userId: string;
  applicantName?: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

interface FormData {
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
}

const emptyForm: FormData = { type: "", startDate: "", endDate: "", reason: "" };

const typeLabels: Record<string, string> = {
  annual: "年假",
  sick: "病假",
  personal: "事假",
  marriage: "婚假",
  bereavement: "丧假",
  maternity: "产假",
  other: "其他",
};

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

const statusLabels: Record<string, string> = {
  pending: "待审批",
  approved: "已通过",
  rejected: "已驳回",
};

export default function LeavePage() {
  const [form, setForm] = useState<FormData>(emptyForm);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [applicationOpen, setApplicationOpen] = useState(false);
  // 重复提交确认弹窗状态
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateMsg, setDuplicateMsg] = useState("");
  const [forceForm, setForceForm] = useState<FormData | null>(null);
  const [myRecords, setMyRecords] = useState<LeaveRecord[]>([]);
  const [allRecords, setAllRecords] = useState<LeaveRecord[]>([]);
  const [demoRole, setDemoRole] = useState<"admin" | "employee">(() =>
    typeof window !== "undefined" && window.localStorage.getItem("fanshen-demo-role") === "employee" ? "employee" : "admin"
  );

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setDemoRole(data?.user?.role === "employee" ? "employee" : "admin"))
      .catch(() => setDemoRole("admin"));
  }, []);

  const loadRecords = async () => {
    const response = await fetch("/api/leave", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { records?: LeaveRecord[] };
    const records = data.records ?? [];
    setAllRecords(records);
    setMyRecords(records);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRecords();
  }, [demoRole]);

  const calcDays = (start: string, end: string) => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diff = Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
    return diff > 0 ? diff : 0;
  };

  const days = useMemo(() => calcDays(form.startDate, form.endDate), [form.startDate, form.endDate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!form.type || !form.startDate || !form.endDate || !form.reason.trim() || days <= 0) {
      setError("请完整填写有效的请假信息。");
      return;
    }

    setSubmitting(true);
    const response = await fetch("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, reason: form.reason.trim() }),
    }).catch(() => null);
    setSubmitting(false);

    if (!response?.ok) {
      const data = await response?.json().catch(() => null);
      // 重复提交检测：409 + duplicate 标记，弹出确认框，允许强制继续
      if (response?.status === 409 && data?.duplicate) {
        setDuplicateMsg(data.message || "检测到可能的重复提交。");
        setForceForm({ ...form, reason: form.reason.trim() });
        setDuplicateOpen(true);
        return;
      }
      setError(data?.message || "提交失败，请稍后重试。");
      return;
    }

    await loadRecords();
    setForm(emptyForm);
    setApplicationOpen(false);
    setNotice("请假申请已提交，管理端审批中心会同步显示。");
    window.setTimeout(() => setNotice(""), 3000);
  };

  // 用户在重复弹窗中选择「仍然提交」
  const confirmForceSubmit = async () => {
    if (!forceForm) return;
    setDuplicateOpen(false);
    setSubmitting(true);
    const response = await fetch("/api/leave?force=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...forceForm, reason: forceForm.reason.trim() }),
    }).catch(() => null);
    setSubmitting(false);
    setForceForm(null);
    if (!response?.ok) {
      const data = await response?.json().catch(() => null);
      setError(data?.message || "提交失败，请稍后重试。");
      return;
    }
    await loadRecords();
    setForm(emptyForm);
    setApplicationOpen(false);
    setNotice("请假申请已提交，管理端审批中心会同步显示。");
    window.setTimeout(() => setNotice(""), 3000);
  };

  const reviewLeave = async (id: string, status: "approved" | "rejected") => {
    const response = await fetch(`/api/leave/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (response.ok) await loadRecords();
  };

  const closeApplication = () => {
    if (submitting) return;
    setApplicationOpen(false);
    setError("");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">请假管理</h2>
          <p className="mt-1 text-sm text-gray-400">
            员工提交请假后会进入管理端审批中心，审批结果会同步回请假记录。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setApplicationOpen(true)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1e3a5f] px-4 text-sm font-medium text-white transition-colors hover:bg-[#2d5a8e] active:scale-[0.98]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          请假申请
        </button>
      </div>

      {notice && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

      {demoRole === "employee" && (
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-base font-semibold text-gray-800">我的请假记录</h3>
          <LeaveTable records={myRecords} showApplicant={false} />
        </div>
      )}

      {demoRole === "admin" && (
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-base font-semibold text-gray-800">全部请假记录</h3>
          <LeaveTable records={allRecords} showApplicant onReview={reviewLeave} />
        </div>
      )}

      {/* 重复提交确认弹窗 */}
      {duplicateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center gap-3 border-b border-amber-100 px-5 py-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <path d="M12 9v4" /><path d="M12 17h.01" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-gray-800">疑似重复提交</h3>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-sm text-gray-600">{duplicateMsg}</p>
              <p className="text-xs text-gray-400">如确为不同事项，可点击「仍然提交」继续；否则请关闭弹窗检查已有记录。</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={() => { setDuplicateOpen(false); setForceForm(null); }}
                className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                关闭
              </button>
              <button
                type="button"
                onClick={confirmForceSubmit}
                disabled={submitting}
                className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "提交中..." : "仍然提交"}
              </button>
            </div>
          </div>
        </div>
      )}

      {applicationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-semibold text-gray-800">请假申请</h3>
              <button
                type="button"
                onClick={closeApplication}
                aria-label="关闭请假申请"
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              <label className="block text-sm text-gray-600">
                请假类型
                <select
                  value={form.type}
                  onChange={(event) => setForm({ ...form, type: event.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                >
                  <option value="">请选择请假类型</option>
                  {Object.entries(typeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-sm text-gray-600">
                  开始日期
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(event) => setForm({ ...form, startDate: event.target.value })}
                    className="mt-1.5 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                  />
                </label>
                <label className="block text-sm text-gray-600">
                  结束日期
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(event) => setForm({ ...form, endDate: event.target.value })}
                    className="mt-1.5 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                  />
                </label>
              </div>

              {days > 0 && (
                <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
                  共计 <strong>{days}</strong> 天
                </div>
              )}

              <label className="block text-sm text-gray-600">
                请假原因
                <textarea
                  value={form.reason}
                  onChange={(event) => setForm({ ...form, reason: event.target.value })}
                  rows={4}
                  placeholder="请输入请假原因..."
                  className="mt-1.5 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                />
              </label>

              {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeApplication}
                  className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#1e3a5f] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2d5a8e] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "提交中..." : "提交申请"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function LeaveTable({
  records,
  showApplicant,
  onReview,
}: {
  records: LeaveRecord[];
  showApplicant: boolean;
  onReview?: (id: string, status: "approved" | "rejected") => void;
}) {
  const colSpan = showApplicant ? 6 : 6;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {showApplicant && <th className="px-3 py-2.5 text-left font-medium text-gray-500">申请人</th>}
            <th className="px-3 py-2.5 text-left font-medium text-gray-500">类型</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-500">起止日期</th>
            <th className="px-3 py-2.5 text-center font-medium text-gray-500">天数</th>
            <th className="hidden px-3 py-2.5 text-left font-medium text-gray-500 sm:table-cell">原因</th>
            <th className="px-3 py-2.5 text-center font-medium text-gray-500">状态</th>
            {!showApplicant && <th className="hidden px-3 py-2.5 text-left font-medium text-gray-500 md:table-cell">申请时间</th>}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id} className="border-b border-gray-50 hover:bg-gray-50/50">
              {showApplicant && <td className="px-3 py-2.5 text-gray-700">{record.applicantName || record.userId}</td>}
              <td className="px-3 py-2.5">
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">{typeLabels[record.type] || record.type}</span>
              </td>
              <td className="px-3 py-2.5 text-xs text-gray-600">
                {record.startDate} ~ {record.endDate}
              </td>
              <td className="px-3 py-2.5 text-center text-gray-600">{record.days}天</td>
              <td className="hidden max-w-[180px] truncate px-3 py-2.5 text-xs text-gray-500 sm:table-cell">{record.reason}</td>
              <td className="px-3 py-2.5 text-center">
                <span className={`rounded-full px-2 py-0.5 text-xs ${statusColors[record.status]}`}>
                  {statusLabels[record.status]}
                </span>
                {showApplicant && record.status === "pending" && onReview && (
                  <div className="mt-2 flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => onReview(record.id, "approved")}
                      className="rounded bg-emerald-500 px-2 py-1 text-[10px] text-white hover:bg-emerald-600"
                    >
                      通过
                    </button>
                    <button
                      type="button"
                      onClick={() => onReview(record.id, "rejected")}
                      className="rounded bg-red-500 px-2 py-1 text-[10px] text-white hover:bg-red-600"
                    >
                      驳回
                    </button>
                  </div>
                )}
              </td>
              {!showApplicant && <td className="hidden px-3 py-2.5 text-xs text-gray-400 md:table-cell">{record.createdAt}</td>}
            </tr>
          ))}
          {records.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="py-6 text-center text-gray-400">
                暂无请假记录
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
