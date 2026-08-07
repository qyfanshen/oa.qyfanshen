"use client";

import { useEffect, useMemo, useState } from "react";

type Member = { employeeId: string; confirmedStage?: string };
type Employee = { id: string; name: string; department: string };
type Project = { id: string; name: string; partnerName: string; status: string; priority: string; startDate?: string; endDate?: string; budget: number; progress: number; members: Member[] };

const stages = ["planning", "in_progress", "testing", "delivered", "maintenance", "completed"];
const labels: Record<string, string> = { planning: "规划中", in_progress: "进行中", testing: "测试中", delivered: "已交付", maintenance: "维护中", completed: "已完成" };
const colors: Record<string, string> = { planning: "bg-purple-100 text-purple-700", in_progress: "bg-blue-100 text-blue-700", testing: "bg-amber-100 text-amber-700", delivered: "bg-cyan-100 text-cyan-700", maintenance: "bg-gray-100 text-gray-600", completed: "bg-emerald-100 text-emerald-700" };

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", partnerName: "", budget: "", startDate: "", endDate: "" });

  const load = async () => {
    const [projectResponse, authResponse] = await Promise.all([fetch("/api/projects", { cache: "no-store" }), fetch("/api/auth/me")]);
    const projectData = await projectResponse.json(); const authData = authResponse.ok ? await authResponse.json() : null;
    if (projectResponse.ok) setProjects(projectData.projects as Project[]);
    const admin = ["admin", "superadmin", "manager"].includes(authData?.user?.role); setIsAdmin(admin);
    if (admin) { const employeesResponse = await fetch("/api/employees"); const employeeData = await employeesResponse.json(); if (employeesResponse.ok) setEmployees(employeeData.employees as Employee[]); }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => projects.filter((project) => (filter === "all" || project.status === filter) && (!search || `${project.name} ${project.partnerName}`.toLowerCase().includes(search.toLowerCase()))), [projects, filter, search]);
  const employeeName = (id: string) => employees.find((employee) => employee.id === id)?.name || "员工";

  const createProject = async () => {
    if (!form.name.trim() || !form.partnerName.trim()) return;
    const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, budget: Number(form.budget) || 0 }) });
    if (response.ok) { setForm({ name: "", partnerName: "", budget: "", startDate: "", endDate: "" }); setShowCreate(false); await load(); }
  };
  const assign = async (projectId: string, employeeId: string, assigned: boolean) => { const response = await fetch(`/api/projects/${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assign", employeeId, assigned }) }); if (response.ok) await load(); };
  const confirm = async (projectId: string) => { const response = await fetch(`/api/projects/${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm" }) }); if (response.ok) await load(); };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-gray-800">项目管理</h2><p className="mt-1 text-sm text-gray-400">员工仅可查看分配给自己的项目</p></div>{isAdmin && <button onClick={() => setShowCreate(true)} className="rounded-lg bg-[#1e3a5f] px-4 py-2.5 text-sm font-medium text-white">+ 新增项目</button>}</div>
    {showCreate && <div className="rounded-xl border border-[#1e3a5f]/20 bg-white p-5 shadow-sm"><h3 className="mb-4 font-semibold">新增项目</h3><div className="grid gap-3 sm:grid-cols-2"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="项目名称" className="rounded-lg border p-2.5 text-sm"/><input value={form.partnerName} onChange={(e) => setForm({ ...form, partnerName: e.target.value })} placeholder="合作方名称" className="rounded-lg border p-2.5 text-sm"/><input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="预算（元）" className="rounded-lg border p-2.5 text-sm"/><div className="grid grid-cols-2 gap-3"><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="rounded-lg border p-2.5 text-sm"/><input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="rounded-lg border p-2.5 text-sm"/></div></div><div className="mt-4 flex justify-end gap-3"><button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm">取消</button><button onClick={createProject} className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm text-white">创建</button></div></div>}
    <div className="flex flex-wrap gap-2"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索项目或合作方" className="rounded-lg border bg-white px-3 py-2 text-sm"/>{["all", ...stages].map((status) => <button key={status} onClick={() => setFilter(status)} className={`rounded-lg px-3 py-2 text-xs ${filter === status ? "bg-[#1e3a5f] text-white" : "bg-white text-gray-500"}`}>{status === "all" ? "全部" : labels[status]}</button>)}</div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((project) => { const next = stages[stages.indexOf(project.status) + 1]; return <div key={project.id} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-gray-800">{project.name}</h3><p className="mt-1 text-xs text-gray-400">合作方：{project.partnerName}</p></div><span className={`rounded-full px-2 py-1 text-xs ${colors[project.status]}`}>{labels[project.status]}</span></div><div className="mt-4"><div className="mb-1 flex justify-between text-xs text-gray-500"><span>完成程度</span><span>{project.progress}%</span></div><div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-[#0ea5e9]" style={{ width: `${project.progress}%` }}/></div></div><div className="mt-4 text-xs text-gray-500">周期：{project.startDate || "未设置"} ～ {project.endDate || "未设置"}<br/>预算：¥{project.budget.toLocaleString()}</div><div className="mt-4 border-t pt-3"><div className="mb-2 text-xs font-medium text-gray-600">项目成员（{project.members.length}）</div><div className="flex flex-wrap gap-2">{project.members.map((member) => <span key={member.employeeId} className="rounded-full bg-slate-100 px-2 py-1 text-xs">{employeeName(member.employeeId)}{isAdmin && <button onClick={() => assign(project.id, member.employeeId, false)} className="ml-1 text-red-500">×</button>}</span>)}{project.members.length === 0 && <span className="text-xs text-gray-400">暂未分配成员</span>}</div>{isAdmin && <select defaultValue="" onChange={(e) => { if (e.target.value) { void assign(project.id, e.target.value, true); e.target.value = ""; } }} className="mt-3 w-full rounded border p-2 text-xs"><option value="">+ 分配员工</option>{employees.filter((employee) => !project.members.some((member) => member.employeeId === employee.id)).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}（{employee.department}）</option>)}</select>}</div>{!isAdmin && <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-gray-600"><p>当前阶段：{labels[project.status]}</p>{next ? <button onClick={() => confirm(project.id)} className="mt-2 w-full rounded bg-[#1e3a5f] px-3 py-2 text-white">确认完成本阶段</button> : <p className="mt-2 text-emerald-600">项目已完成</p>}</div>}</div>; })}</div>
    {filtered.length === 0 && <div className="py-12 text-center text-gray-400">暂无可查看的项目</div>}
  </div>;
}
