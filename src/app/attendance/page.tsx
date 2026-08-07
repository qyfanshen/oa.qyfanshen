"use client";

import { useState, useEffect, useMemo } from "react";
type AttendanceRecord = { id: string; userId: string; employeeName?: string; date: string; clockIn: string | null; clockOut: string | null; status: string; type: string };

const statusColors: Record<string, string> = {
  normal: "bg-emerald-100 text-emerald-700",
  late: "bg-amber-100 text-amber-700",
  early: "bg-orange-100 text-orange-700",
  absent: "bg-red-100 text-red-700",
  overtime: "bg-blue-100 text-blue-700",
};
const statusLabels: Record<string, string> = {
  normal: "正常",
  late: "迟到",
  early: "早退",
  absent: "缺勤",
  overtime: "加班",
};
const typeLabels: Record<string, string> = { office: "办公室", remote: "远程" };

export default function AttendancePage() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [clockedIn, setClockedIn] = useState(false);
  const [clockedOut, setClockedOut] = useState(false);
  const [clockInTime, setClockInTime] = useState("");
  const [clockOutTime, setClockOutTime] = useState("");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [searchUser, setSearchUser] = useState("");
  const [demoRole, setDemoRole] = useState<"admin" | "employee">(() => typeof window !== "undefined" && window.localStorage.getItem("fanshen-demo-role") === "employee" ? "employee" : "admin");

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncRole = () => setDemoRole(window.localStorage.getItem("fanshen-demo-role") === "employee" ? "employee" : "admin");
    window.addEventListener("fanshen-role-change", syncRole);
    return () => window.removeEventListener("fanshen-role-change", syncRole);
  }, []);

  const loadRecords = async () => {
    const response = await fetch("/api/attendance", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) return;
    const loaded = data.records as AttendanceRecord[];
    setRecords(loaded);
    const today = new Date().toLocaleDateString("en-CA");
    const record = loaded.find((item) => item.date === today);
    setClockedIn(Boolean(record?.clockIn));
    setClockedOut(Boolean(record?.clockOut));
    setClockInTime(record?.clockIn || "");
    setClockOutTime(record?.clockOut || "");
  };
  // Records are loaded from the server whenever the signed-in role changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadRecords(); }, [demoRole]);

  const handleClockIn = async () => {
    try {
      const response = await fetch("/api/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clockIn", workType: "office" }) });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(`签到失败：${data.message || `HTTP ${response.status}`}`);
        return;
      }
      await loadRecords();
    } catch (error) {
      alert(`签到异常：${(error as Error).message}`);
    }
  };

  const handleClockOut = async () => {
    try {
      const response = await fetch("/api/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clockOut" }) });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(`签退失败：${data.message || `HTTP ${response.status}`}`);
        return;
      }
      await loadRecords();
    } catch (error) {
      alert(`签退异常：${(error as Error).message}`);
    }
  };

  const filtered = useMemo(() => {
    const visibleRecords = records;
    if (!searchUser || demoRole !== "admin") return visibleRecords;
    const s = searchUser.toLowerCase();
    return visibleRecords.filter((r) => {
      return r.employeeName?.toLowerCase().includes(s);
    });
  }, [demoRole, records, searchUser]);

  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}年${m}月${day}日`;
  };

  const formatClock = (d: Date) => {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  };

  const weekDayLabels = ["日", "一", "二", "三", "四", "五", "六"];
  const todayStr = formatDate(currentTime);
  const clockStr = formatClock(currentTime);
  const today = currentTime.getDay();

  const visibleRecords = records;
  const inCount = visibleRecords.filter(r => r.clockIn).length;
  const lateCount = visibleRecords.filter(r => r.status === "late").length;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">考勤打卡</h2>

      {/* Clock In/Out Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Current Time Display */}
        <div className="bg-gradient-to-br from-[#1e3a5f] to-[#2d5a8e] rounded-xl p-6 text-white">
          <div className="text-sm text-white/70 mb-1">{todayStr} 星期{weekDayLabels[today]}</div>
          <div className="text-5xl font-bold tracking-wider mb-2">{clockStr}</div>
          {demoRole === "admin" && <div className="flex gap-4 mt-4">
            <div className="bg-white/15 rounded-lg px-4 py-2">
              <div className="text-xs text-white/60">今日出勤</div>
              <div className="text-xl font-bold">{inCount}<span className="text-sm font-normal">/{records.length}</span></div>
            </div>
            <div className="bg-white/15 rounded-lg px-4 py-2">
              <div className="text-xs text-white/60">迟到</div>
              <div className="text-xl font-bold">{lateCount}</div>
            </div>
          </div>}
        </div>

        {/* Clock Buttons */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col items-center justify-center gap-4">
          <div className="flex gap-4 w-full">
            <button
              onClick={handleClockIn}
              disabled={clockedIn}
              className={`flex-1 py-4 rounded-xl text-white font-bold text-lg transition-all ${
                clockedIn
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-emerald-500 hover:bg-emerald-600 active:scale-95 shadow-lg shadow-emerald-200"
              }`}
            >
              {clockedIn ? `已签到 ${clockInTime}` : "签 到"}
            </button>
            <button
              onClick={handleClockOut}
              disabled={!clockedIn || clockedOut}
              className={`flex-1 py-4 rounded-xl text-white font-bold text-lg transition-all ${
                !clockedIn || clockedOut
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-[#1e3a5f] hover:bg-[#2d5a8e] active:scale-95 shadow-lg shadow-blue-200"
              }`}
            >
              {clockedOut ? `已签退 ${clockOutTime}` : "签 退"}
            </button>
          </div>
          {(clockedIn || clockedOut) && (
            <div className="text-xs text-gray-400">
              {clockedIn && `签到时间：${clockInTime}`}
              {clockedIn && clockedOut && " · "}
              {clockedOut && `签退时间：${clockOutTime}`}
            </div>
          )}
        </div>
      </div>

      {/* Records */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="text-base font-semibold text-gray-800">考勤记录</h3>
          {demoRole === "admin" && <div className="relative w-full sm:w-64">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text" placeholder="搜索员工姓名..."
              value={searchUser} onChange={(e) => setSearchUser(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
            />
          </div>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-2.5 px-3 text-gray-500 font-medium">员工</th>
                <th className="text-left py-2.5 px-3 text-gray-500 font-medium">日期</th>
                <th className="text-center py-2.5 px-3 text-gray-500 font-medium">签到</th>
                <th className="text-center py-2.5 px-3 text-gray-500 font-medium">签退</th>
                <th className="text-center py-2.5 px-3 text-gray-500 font-medium">状态</th>
                <th className="text-center py-2.5 px-3 text-gray-500 font-medium hidden sm:table-cell">方式</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                return (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white text-xs">
                          {r.employeeName?.charAt(0) || "?"}
                        </div>
                        <span className="text-gray-700">{r.employeeName || r.userId}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-gray-600">{r.date}</td>
                    <td className="py-2.5 px-3 text-center text-gray-600">{r.clockIn}</td>
                    <td className="py-2.5 px-3 text-center text-gray-600">{r.clockOut}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[r.status] || "bg-gray-100 text-gray-600"}`}>
                        {statusLabels[r.status] || r.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center text-gray-500 hidden sm:table-cell">{typeLabels[r.type] || r.type}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center text-gray-400 py-8">暂无考勤记录</div>
        )}
      </div>
    </div>
  );
}
