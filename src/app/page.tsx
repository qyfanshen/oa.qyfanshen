"use client";

import { useEffect, useMemo, useState } from "react";

type Stats = { totalEmployees: number; todayAttendance: number; pendingApprovals: number; activeProjects: number; monthlyRevenue: number; partnerCount: number };
type Approval = { id: string; title: string; applicantId: string; applicantName?: string; type: string; amount?: number; status: string };
type Announcement = { id: string; title: string; content: string; pinned: boolean; createdAt: string };

const T = {
  employeeTotal: "\u5458\u5de5\u603b\u6570", attendance: "\u4eca\u65e5\u51fa\u52e4", pending: "\u5f85\u5ba1\u6279", projects: "\u6d3b\u8dc3\u9879\u76ee", revenue: "\u672c\u6708\u8425\u6536", partners: "\u5408\u4f5c\u65b9", todo: "\u5f85\u529e\u4e8b\u9879", approvalList: "\u5f85\u5ba1\u6279\u5217\u8868", announcements: "\u6700\u65b0\u516c\u544a", none: "\u6682\u65e0\u6570\u636e", type: "\u7c7b\u578b", title: "\u6807\u9898", applicant: "\u7533\u8bf7\u4eba", amount: "\u91d1\u989d", status: "\u72b6\u6001",
};
const emptyStats: Stats = { totalEmployees: 0, todayAttendance: 0, pendingApprovals: 0, activeProjects: 0, monthlyRevenue: 0, partnerCount: 0 };

function StatCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  return <div className="min-w-0 rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm text-gray-500">{label}</p><p className="mt-3 truncate text-2xl font-bold text-gray-800">{value}</p></div><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${color}`}>{icon}</div></div></div>;
}

function safeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(safeNumber(value));
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const [statsResponse, approvalResponse, announcementResponse] = await Promise.all([fetch("/api/dashboard", { cache: "no-store" }), fetch("/api/approvals", { cache: "no-store" }), fetch("/api/announcements", { cache: "no-store" })]);
    const statsData = statsResponse.ok ? await statsResponse.json() : null;
    const approvalData = approvalResponse.ok ? await approvalResponse.json() : null;
    const announcementData = announcementResponse.ok ? await announcementResponse.json() : null;
    if (statsData?.stats) setStats({ ...emptyStats, ...Object.fromEntries(Object.entries(statsData.stats).map(([key, value]) => [key, safeNumber(value)])) });
    if (approvalData?.approvals) setApprovals(approvalData.approvals);
    if (announcementData?.announcements) setAnnouncements(announcementData.announcements.slice(0, 5));
    setLoaded(true);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  const pending = useMemo(() => approvals.filter((item) => item.status === "pending" || item.status === "processing"), [approvals]);
  const currency = formatMoney(stats.monthlyRevenue);
  const cards = [
    [T.employeeTotal, `${stats.totalEmployees} \u4eba`, "bg-[#1e3a5f]", "\u4eba"],
    [T.attendance, `${stats.todayAttendance} \u4eba`, "bg-emerald-500", "\u949f"],
    [T.pending, `${pending.length} \u9879`, "bg-amber-500", "\u5ba1"],
    [T.projects, `${stats.activeProjects} \u4e2a`, "bg-violet-500", "\u9879"],
    [T.revenue, currency, "bg-cyan-500", "\u00a5"],
    [T.partners, `${stats.partnerCount} \u5bb6`, "bg-rose-500", "\u4f01"],
  ];

  return <div className="space-y-6">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">{cards.map(([label, value, color, icon]) => <StatCard key={label} label={label} value={loaded ? value : "-"} color={color} icon={icon} />)}</div>
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3"><div className="space-y-6 xl:col-span-2"><section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><h3 className="font-semibold text-gray-800">{T.todo}</h3><span className="text-xs text-gray-400">{pending.length} \u9879</span></div>{pending.length ? <div className="space-y-2">{pending.map((item) => <div key={`todo-${item.id}`} className="flex items-center gap-3 rounded-lg border border-gray-50 p-3"><span className="h-2 w-2 rounded-full bg-amber-400"/><span className="min-w-0 flex-1 truncate text-sm text-gray-700">{T.pending}: {item.title}</span><span className="text-xs text-gray-400">{item.applicantName || item.applicantId}</span></div>)}</div> : <p className="py-6 text-center text-sm text-gray-400">{T.none}</p>}</section><section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><h3 className="mb-4 font-semibold text-gray-800">{T.approvalList}</h3><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b border-gray-100 text-left text-gray-500"><th className="px-3 py-2">{T.type}</th><th className="px-3 py-2">{T.title}</th><th className="px-3 py-2">{T.applicant}</th><th className="px-3 py-2 text-right">{T.amount}</th><th className="px-3 py-2 text-center">{T.status}</th></tr></thead><tbody>{pending.map((item) => <tr key={item.id} className="border-b border-gray-50"><td className="px-3 py-3">{item.type}</td><td className="max-w-[280px] truncate px-3 py-3 font-medium text-gray-700">{item.title}</td><td className="px-3 py-3 text-gray-500">{item.applicantName || item.applicantId}</td><td className="px-3 py-3 text-right">{item.amount ? new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(Number(item.amount)) : "-"}</td><td className="px-3 py-3 text-center"><span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">{T.pending}</span></td></tr>)}{!pending.length && <tr><td colSpan={5} className="py-8 text-center text-gray-400">{T.none}</td></tr>}</tbody></table></div></section></div><aside className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><h3 className="mb-4 font-semibold text-gray-800">{T.announcements}</h3><div className="space-y-3">{announcements.map((item) => <div key={item.id} className={`rounded-lg border p-3 ${item.pinned ? "border-amber-200 bg-amber-50" : "border-gray-50"}`}><div className="flex items-start gap-2"><span className="min-w-0 flex-1 text-sm font-medium text-gray-700">{item.title}</span>{item.pinned && <span className="text-xs text-amber-600">\u7f6e\u9876</span>}</div><p className="mt-2 line-clamp-3 text-xs leading-5 text-gray-500">{item.content}</p><p className="mt-2 text-xs text-gray-400">{item.createdAt}</p></div>)}{!announcements.length && <p className="py-8 text-center text-sm text-gray-400">{T.none}</p>}</div></aside></div>
  </div>;
}
