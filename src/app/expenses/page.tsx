"use client";

import { useEffect, useState } from "react";
import { getClientSession } from "@/lib/client-session";
type ExpenseAttachment = { name: string; url: string; size: number; type: string; storageKey?: string };
type ExpenseRecord = { id: string; userId: string; applicantName?: string; type: string; amount: number; date: string; description: string; status: "pending" | "approved" | "rejected"; createdAt: string; attachments?: ExpenseAttachment[] };

const typeLabels: Record<string, string> = {
  travel: "差旅费", entertainment: "招待费", office: "办公费", transport: "交通费", other: "其他",
};
const typeColors: Record<string, string> = {
  travel: "bg-blue-100 text-blue-700",
  entertainment: "bg-purple-100 text-purple-700",
  office: "bg-emerald-100 text-emerald-700",
  transport: "bg-orange-100 text-orange-700",
  other: "bg-gray-100 text-gray-600",
};
const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};
const statusLabels: Record<string, string> = {
  pending: "待审批", approved: "已通过", rejected: "已驳回",
};

interface FormData {
  type: string;
  amount: string;
  date: string;
  description: string;
}

const emptyForm: FormData = { type: "", amount: "", date: "", description: "" };

export default function ExpensesPage() {
  const [form, setForm] = useState<FormData>(emptyForm);
  const [formError, setFormError] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [applicationOpen, setApplicationOpen] = useState(false);
  // 重复提交确认弹窗状态
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateMsg, setDuplicateMsg] = useState("");
  const [forcePayload, setForcePayload] = useState<FormData | null>(null);
  const [allRecords, setAllRecords] = useState<ExpenseRecord[]>([]);
  const [demoRole, setDemoRole] = useState<"admin" | "employee">(() => typeof window !== "undefined" && window.localStorage.getItem("fanshen-demo-role") === "employee" ? "employee" : "admin");

  useEffect(() => {
    getClientSession()
      .then((user) => setDemoRole(user?.role === "employee" ? "employee" : "admin"))
      .catch(() => setDemoRole("admin"));
  }, []);

  const loadRecords = async () => {
    const response = await fetch("/api/expenses", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setAllRecords(data.records as ExpenseRecord[]);
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadRecords(); }, [demoRole]);

  const resetForm = () => {
    setForm(emptyForm);
    setAttachments([]);
    setFileInputKey((value) => value + 1);
    setFormError("");
  };

  const closeApplication = () => {
    if (submitting) return;
    setApplicationOpen(false);
    setFormError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!form.type || !form.date || !form.description.trim() || !Number.isFinite(amount) || amount <= 0) {
      setFormError("请完整填写费用类型、金额、日期和费用说明。");
      return;
    }
    setSubmitting(true);
    const payload = new FormData();
    payload.append("type", form.type);
    payload.append("amount", String(amount));
    payload.append("date", form.date);
    payload.append("description", form.description);
    attachments.forEach((file) => payload.append("attachments", file));
    const response = await fetch("/api/expenses", { method: "POST", body: payload });
    setSubmitting(false);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      // 重复提交检测：409 + duplicate 标记，弹出确认框，允许强制继续
      if (response.status === 409 && data?.duplicate) {
        setDuplicateMsg(data.message || "检测到可能的重复提交。");
      setForcePayload({ ...form });
        // 关闭申请弹窗，避免两个弹窗叠加造成焦点混乱
        setApplicationOpen(false);
        setDuplicateOpen(true);
        return;
      }
      setFormError(data?.message || "提交失败，请稍后重试");
      return;
    }
    await loadRecords();
    resetForm();
    setSubmitted(true);
    setApplicationOpen(false);
    setTimeout(() => setSubmitted(false), 3000);
  };

  // 用户在重复弹窗中选择「仍然提交」
  const confirmForceSubmit = async () => {
    if (!forcePayload) return;
    const amount = Number(forcePayload.amount);
    const payload = new FormData();
    payload.append("type", forcePayload.type);
    payload.append("amount", String(amount));
    payload.append("date", forcePayload.date);
    payload.append("description", forcePayload.description);
    attachments.forEach((file) => payload.append("attachments", file));
    setDuplicateOpen(false);
    setSubmitting(true);
    const response = await fetch("/api/expenses?force=1", { method: "POST", body: payload });
    setSubmitting(false);
    setForcePayload(null);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setFormError(data?.message || "提交失败，请稍后重试");
      return;
    }
    await loadRecords();
    resetForm();
    setSubmitted(true);
    setApplicationOpen(false);
    setTimeout(() => setSubmitted(false), 3000);
  };

  const reviewExpense = async (id: string, status: "approved" | "rejected") => {
    const response = await fetch(`/api/expenses/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (response.ok) await loadRecords();
  };

  // 员工视角：只看自己的记录；管理员视角：看全部
  const myRecords = demoRole === "employee" ? allRecords : allRecords;
  const myTotal = myRecords.reduce((sum, r) => sum + r.amount, 0);
  const myApproved = myRecords.filter((r) => r.status === "approved").length;
  const myPending = myRecords.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      {/* 标题区 + 申请按钮 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">费用报销</h2>
          <p className="mt-1 text-sm text-gray-400">
            提交报销后会进入管理端审批中心，审批结果会同步回报销记录。
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
          报销申请
        </button>
      </div>

      {/* 提交成功提示 */}
      {submitted && (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          报销申请已提交，等待管理员审核。
        </div>
      )}

      {/* 员工视角：顶部统计卡片 */}
      {demoRole === "employee" && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 text-center">
            <div className="text-xs text-gray-400 mb-1">总报销</div>
            <div className="text-lg font-bold text-[#1e3a5f]">¥{myTotal.toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 text-center">
            <div className="text-xs text-gray-400 mb-1">已通过</div>
            <div className="text-lg font-bold text-emerald-600">{myApproved}</div>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 text-center">
            <div className="text-xs text-gray-400 mb-1">待审批</div>
            <div className="text-lg font-bold text-amber-600">{myPending}</div>
          </div>
        </div>
      )}

      {/* 员工视角：我的报销记录 */}
      {demoRole === "employee" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-base font-semibold text-gray-800 mb-4">我的报销记录</h3>
          <ExpenseTable records={myRecords} showReviewButton={false} onReview={reviewExpense} />
        </div>
      )}

      {/* 管理员视角：全部报销记录 */}
      {demoRole === "admin" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-base font-semibold text-gray-800 mb-4">全部报销记录</h3>
          <ExpenseTable records={allRecords} showReviewButton onReview={reviewExpense} />
        </div>
      )}

      {/* 重复提交确认弹窗（z-index 60，置于报销申请弹窗之上） */}
      {duplicateOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
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
                onClick={() => {
                  setDuplicateOpen(false);
                  setForcePayload(null);
                  // 关闭重复弹窗后，自动重开申请弹窗，让用户调整后重新提交
                  setApplicationOpen(true);
                }}
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

      {/* 报销申请弹窗 */}
      {applicationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-semibold text-gray-800">报销申请</h3>
              <button
                type="button"
                onClick={closeApplication}
                aria-label="关闭报销申请"
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
                费用类型
                <select
                  required
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                >
                  <option value="">请选择费用类型</option>
                  <option value="travel">差旅费</option>
                  <option value="entertainment">招待费</option>
                  <option value="office">办公费</option>
                  <option value="transport">交通费</option>
                  <option value="other">其他</option>
                </select>
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-sm text-gray-600">
                  金额（元）
                  <input
                    required
                    type="number"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="mt-1.5 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                  />
                </label>
                <label className="block text-sm text-gray-600">
                  费用日期
                  <input
                    required
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="mt-1.5 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                  />
                </label>
              </div>

              <label className="block text-sm text-gray-600">
                费用说明
                <textarea
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={4}
                  placeholder="请详细描述费用用途..."
                  className="mt-1.5 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                />
              </label>

              <div>
                <label className="block text-sm text-gray-600 mb-1.5">证明附件（可选）</label>
                <input
                  key={fileInputKey}
                  type="file"
                  multiple
                  accept="image/*,.pdf"
                  onChange={(e) => setAttachments(Array.from(e.target.files || []).slice(0, 5))}
                  className="w-full rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-[#1e3a5f] file:px-3 file:py-1.5 file:text-sm file:text-white"
                />
                <p className="mt-1 text-xs text-gray-400">支持图片或 PDF，最多 5 个，单个不超过 10MB。</p>
                {attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {attachments.map((file) => (
                      <span key={`${file.name}-${file.size}`} className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
                        {file.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {formError && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</div>
              )}

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

function ExpenseTable({
  records,
  showReviewButton,
  onReview,
}: {
  records: ExpenseRecord[];
  showReviewButton: boolean;
  onReview: (id: string, status: "approved" | "rejected") => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            {showReviewButton && <th className="text-left py-2.5 px-3 text-gray-500 font-medium">申请人</th>}
            <th className="text-left py-2.5 px-3 text-gray-500 font-medium">类型</th>
            <th className="text-left py-2.5 px-3 text-gray-500 font-medium hidden sm:table-cell">说明</th>
            <th className="text-right py-2.5 px-3 text-gray-500 font-medium">金额</th>
            <th className="text-center py-2.5 px-3 text-gray-500 font-medium">附件</th>
            <th className="text-center py-2.5 px-3 text-gray-500 font-medium">日期</th>
            <th className="text-center py-2.5 px-3 text-gray-500 font-medium">状态</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
              {showReviewButton && <td className="py-2.5 px-3 text-gray-700">{r.applicantName || r.userId}</td>}
              <td className="py-2.5 px-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${typeColors[r.type]}`}>{typeLabels[r.type]}</span>
              </td>
              <td className="py-2.5 px-3 text-gray-500 text-xs hidden sm:table-cell max-w-[160px] truncate">{r.description}</td>
              <td className="py-2.5 px-3 text-right font-medium text-gray-700">¥{r.amount.toLocaleString()}</td>
              <td className="py-2.5 px-3 text-center text-xs">
                {r.attachments?.length ? (
                  <div className="flex flex-col items-center gap-1">
                    {r.attachments.map((file, index) => (
                      <a key={`${r.id}-${file.url}`} href={file.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                        附件{index + 1}
                      </a>
                    ))}
                  </div>
                ) : <span className="text-gray-400">-</span>}
              </td>
              <td className="py-2.5 px-3 text-center text-gray-500 text-xs">{r.date}</td>
              <td className="py-2.5 px-3 text-center">
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[r.status]}`}>{statusLabels[r.status]}</span>
                {showReviewButton && r.status === "pending" && (
                  <div className="mt-2 flex justify-center gap-2">
                    <button onClick={() => onReview(r.id, "approved")} className="rounded bg-emerald-500 px-2 py-1 text-[10px] text-white hover:bg-emerald-600">通过</button>
                    <button onClick={() => onReview(r.id, "rejected")} className="rounded bg-red-500 px-2 py-1 text-[10px] text-white hover:bg-red-600">驳回</button>
                  </div>
                )}
              </td>
            </tr>
          ))}
          {records.length === 0 && (
            <tr><td colSpan={showReviewButton ? 7 : 6} className="text-center text-gray-400 py-6">暂无报销记录</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
