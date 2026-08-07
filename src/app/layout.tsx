"use client";

import "./globals.css";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearClientSession, getClientSession } from "@/lib/client-session";
import NotificationBell from "@/components/common/NotificationBell";

const menuItems = [
  { 
    key: "/", label: "工作台", 
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    )
  },
  { 
    key: "/employees", label: "人事管理", 
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    )
  },
  {
    key: "/attendance", label: "考勤打卡",
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    )
  },
  {
    key: "/leave", label: "请假管理",
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 14l2 2 4-4"/>
      </svg>
    )
  },
  {
    key: "/approvals", label: "审批中心", 
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    )
  },
  {
    key: "/my-applications", label: "我的申请", employeeOnly: true,
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
    )
  },
  {
    key: "/documents", label: "文档管理",
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
    )
  },
  {
    key: "/crm", label: "客户管理",
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    )
  },
  {
    key: "/projects", label: "项目管理",
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    )
  },
  {
    key: "/announcements", label: "公告通知",
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
      </svg>
    )
  },
  {
    key: "/chat", label: "消息",
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    )
  },
  {
    key: "/expenses", label: "费用报销",
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    )
  },
  {
    key: "/seal", label: "公章审批",
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
      </svg>
    )
  },
  {
    key: "/meetings", label: "会议管理",
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M12 12v.01"/>
      </svg>
    )
  },
];
const adminOnlyPaths = new Set(["/employees", "/approvals", "/crm"]);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [demoRole, setDemoRole] = useState<"admin" | "employee">("admin");
  const pathname = usePathname();
  const router = useRouter();
  const [sessionUser, setSessionUser] = useState<{ name: string; role: string } | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [chatUnread, setChatUnread] = useState(0);

  useEffect(() => {
    if (pathname === "/login") return;
    getClientSession()
      .then((user) => {
        setSessionUser(user ?? null);
        if (user) {
          const role = user.role === "employee" ? "employee" : "admin";
          window.localStorage.setItem("fanshen-demo-role", role);
          setDemoRole(role);
        } else router.replace("/login");
      })
      .catch(() => { setSessionUser(null); router.replace("/login"); })
      .finally(() => setSessionLoading(false));
  }, [pathname, router]);

  useEffect(() => {
    if (demoRole === "employee" && pathname === "/") router.replace("/attendance");
  }, [demoRole, pathname, router]);

  // 轮询聊天未读数（30s）
  useEffect(() => {
    if (pathname === "/login") return;
    const fetchUnread = () => {
      fetch("/api/chat/conversations", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          const total = (d.conversations || []).reduce((a: number, c: any) => a + (Number(c.unread) || 0), 0);
          setChatUnread(total);
        })
        .catch(() => {});
    };
    fetchUnread();
    const t = setInterval(fetchUnread, 30000);
    return () => clearInterval(t);
  }, [pathname]);

  const shownName = sessionUser?.name ?? "";
  const shownRole = sessionUser?.role === "superadmin" ? "公司总账号" : sessionUser?.role === "admin" ? "系统管理员" : sessionUser?.role === "manager" ? "部门主管" : "员工";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearClientSession();
    window.location.assign("/login");
  }

  if (pathname === "/login") {
    return (
      <html lang="zh-CN" className="h-full">
        <body className="h-full bg-slate-50 antialiased">{children}</body>
      </html>
    );
  }

  if (sessionLoading) {
    return (
      <html lang="zh-CN" className="h-full">
        <body className="h-full bg-[#f5f7fa] antialiased">
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1e3a5f]/20 border-t-[#1e3a5f]" />
              正在加载系统…
            </div>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="zh-CN" className="h-full">
      <body className="h-full overflow-hidden bg-[#f5f7fa] antialiased">
        <div className="flex h-full min-h-screen w-full overflow-hidden supports-[height:100dvh]:h-dvh">
          {mobileMenuOpen && <button aria-label="关闭导航菜单" onClick={() => setMobileMenuOpen(false)} className="fixed inset-0 z-40 bg-slate-900/35 lg:hidden" />}
          {/* Sidebar */}
          <aside
            className={`z-50 flex h-full shrink-0 flex-col bg-[#1e3a5f] text-white transition-[width,transform] duration-300 max-lg:fixed max-lg:inset-y-0 max-lg:left-0 ${
              mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
            } ${
              collapsed ? "w-[68px]" : "w-[240px]"
            } lg:translate-x-0`}
          >
            {/* Brand */}
            <div className="flex items-center h-16 px-4 border-b border-[#2a4a6f] shrink-0">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-8 h-8 rounded-lg bg-[#0ea5e9] flex items-center justify-center text-white font-bold text-sm shrink-0">
                  梵
                </div>
                {!collapsed && (
                  <span className="font-semibold text-lg whitespace-nowrap">梵燊集团</span>
                )}
              </div>
            </div>

            {/* Menu */}
            <nav className="flex-1 overflow-y-auto py-3 px-2">
              {menuItems.filter((item) => (item.employeeOnly ? demoRole === "employee" : demoRole === "admin" || (item.key !== "/" && !adminOnlyPaths.has(item.key)))).map((item) => {
                const active = item.key === "/" ? pathname === "/" : pathname.startsWith(item.key);
                return (
                  <Link
                    key={item.key}
                    href={item.key}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 mb-1 rounded-lg text-sm transition-colors ${
                      active
                        ? "bg-[#0ea5e9]/20 text-[#0ea5e9] font-medium"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span className="shrink-0">{item.icon()}</span>
                    {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
                    {item.key === "/chat" && chatUnread > 0 && (
                      <span className="ml-auto shrink-0 min-w-[20px] h-[20px] px-1.5 rounded-full bg-red-500 text-white text-[10px] leading-[20px] font-semibold text-center">
                        {chatUnread > 99 ? "99+" : chatUnread}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Collapse Toggle */}
            <div className="border-t border-[#2a4a6f] p-3">
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="flex items-center justify-center w-full py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                <svg
                  width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className={`transition-transform ${collapsed ? "rotate-180" : ""}`}
                >
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
            </div>
          </aside>

          {/* Main */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Top Bar */}
            <header className="flex h-16 min-w-0 shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-2">
                <button aria-label="打开导航菜单" onClick={() => setMobileMenuOpen(true)} className="rounded-lg p-2 text-[#1e3a5f] hover:bg-slate-100 lg:hidden">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
                </button>
                <h2 className="truncate text-lg font-semibold text-[#1e3a5f]">
                  梵燊集团 · OA办公系统
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                {/* Notifications */}
                <NotificationBell />
                {/* User */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#0ea5e9] flex items-center justify-center text-white font-medium text-sm">
                    {shownName.charAt(0)}
                  </div>
                  <div className="hidden sm:block text-right">
                    <div className="text-sm font-medium text-gray-700">{shownName}</div>
                    <div className="text-xs text-gray-400">{shownRole}</div>
                  </div>
                  <button onClick={logout} className="text-xs text-gray-400 transition hover:text-red-500">退出</button>
                </div>
              </div>
            </header>

            {/* Page Content */}
            <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
              <div className="mx-auto w-full max-w-none min-w-0">{children}</div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
