"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@/types";

const departments = ["行政部", "财务部", "市场部", "技术部", "项目部", "人事部", "管理层"];

const statusColors: Record<User["status"], string> = {
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-red-100 text-red-700",
};
const statusLabels: Record<User["status"], string> = { active: "在职", inactive: "离职" };
const roleColors: Record<User["role"], string> = {
  superadmin: "bg-red-100 text-red-700", admin: "bg-purple-100 text-purple-700", manager: "bg-blue-100 text-blue-700", employee: "bg-gray-100 text-gray-600",
};
const roleLabels: Record<User["role"], string> = { superadmin: "超级管理员", admin: "管理员", manager: "经理", employee: "员工" };

type EmployeeForm = Pick<User, "name" | "department" | "position" | "email" | "phone" | "role">;
const emptyForm: EmployeeForm = { name: "", department: "", position: "", email: "", phone: "", role: "employee" };

export default function EmployeesPage() {
  const [employeeList, setEmployeeList] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [assignmentUser, setAssignmentUser] = useState<User | null>(null);
  const [assignmentProjectId, setAssignmentProjectId] = useState("");
  const [projectOptions, setProjectOptions] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [issuedCredentials, setIssuedCredentials] = useState<{ name: string; username: string; initialPassword: string } | null>(null);

  const loadEmployees = async () => {
    const response = await fetch("/api/employees", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) setEmployeeList(data.employees as User[]);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadEmployees(); fetch("/api/projects").then((response) => response.ok ? response.json() : null).then((data) => { if (data) setProjectOptions(data.projects); }).catch(() => undefined); }, []);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return employeeList.filter((user) => {
      const matchesKeyword = !keyword || [user.name, user.employeeNo, user.position, user.email, user.phone]
        .some((value) => value.toLowerCase().includes(keyword));
      return matchesKeyword && (!deptFilter || user.department === deptFilter);
    });
  }, [employeeList, search, deptFilter]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setShowForm(true);
  }

  function openEdit(user: User) {
    setEditingId(user.id);
    setForm({ name: user.name, department: user.department, position: user.position, email: user.email, phone: user.phone, role: user.role });
    setFormError("");
    setShowForm(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim() || !form.department || !form.position.trim() || !form.email.trim() || !form.phone.trim()) return;
    if (editingId) {
      const response = await fetch(`/api/employees/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (response.ok) { await loadEmployees(); setShowForm(false); }
    } else {
      setSaving(true);
      setFormError("");
      try {
        const response = await fetch("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        const data = await response.json() as { message?: string; employee?: User; credentials?: { username: string; initialPassword: string } };
        if (!response.ok || !data.employee || !data.credentials) {
          setFormError(data.message || "员工账号创建失败。");
          return;
        }
        await loadEmployees();
        setIssuedCredentials({ name: data.employee.name, ...data.credentials });
        setShowForm(false);
      } catch {
        setFormError("无法连接员工账号服务，请确认数据库和登录系统已配置。");
      } finally {
        setSaving(false);
      }
    }
  }

  async function toggleStatus(id: string) {
    const user = employeeList.find((item) => item.id === id);
    if (!user) return;
    const response = await fetch(`/api/employees/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: user.status === "active" ? "inactive" : "active" }) });
    if (response.ok) await loadEmployees();
  }

  function assignProject(user: User) {
    setAssignmentUser(user);
    setAssignmentProjectId("");
  }

  async function saveAssignment() {
    if (!assignmentUser || !assignmentProjectId) return;
    const response = await fetch(`/api/projects/${assignmentProjectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assign", employeeId: assignmentUser.id, assigned: true }) });
    if (response.ok) setAssignmentUser(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">人事管理</h2>
          <p className="mt-1 text-sm text-gray-400">当前显示 {filtered.length} 名员工</p>
        </div>
        <button onClick={openCreate} className="rounded-lg bg-[#1e3a5f] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#2d5a8e]">+ 新增员工</button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索姓名、工号、职位、邮箱或电话" className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#1e3a5f] focus:ring-2 focus:ring-[#1e3a5f]/20" />
        <select value={deptFilter} onChange={(event) => setDeptFilter(event.target.value)} className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-600 outline-none focus:border-[#1e3a5f]">
          <option value="">全部部门</option>
          {departments.map((department) => <option key={department} value={department}>{department}</option>)}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500"><th className="px-4 py-3">工号</th><th className="px-4 py-3">姓名</th><th className="px-4 py-3">部门</th><th className="px-4 py-3">职位</th><th className="hidden px-4 py-3 md:table-cell">联系方式</th><th className="px-4 py-3 text-center">状态</th><th className="px-4 py-3 text-right">操作</th></tr></thead>
            <tbody>
              {filtered.map((user) => <tr key={user.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                <td className="px-4 py-3 font-mono font-medium text-[#1e3a5f]">{user.employeeNo}</td>
                <td className="px-4 py-3"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1e3a5f] text-xs font-medium text-white">{user.name.charAt(0)}</span><span className="font-medium text-gray-700">{user.name}</span></div></td>
                <td className="px-4 py-3 text-gray-600">{user.department}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${roleColors[user.role]}`}>{roleLabels[user.role]}</span><span className="ml-1.5 text-gray-600">{user.position}</span></td>
                <td className="hidden px-4 py-3 text-gray-500 md:table-cell"><div>{user.phone}</div><div className="text-xs text-gray-400">{user.email}</div></td>
                <td className="px-4 py-3 text-center"><span className={`rounded-full px-2 py-0.5 text-xs ${statusColors[user.status]}`}>{statusLabels[user.status]}</span></td>
                <td className="whitespace-nowrap px-4 py-3 text-right"><button onClick={() => openEdit(user)} className="mr-3 text-xs text-[#1e3a5f] hover:underline">编辑</button><button onClick={() => assignProject(user)} className="mr-3 text-xs text-[#1e3a5f] hover:underline">分配项目</button><button onClick={() => toggleStatus(user.id)} className="text-xs text-red-500 hover:underline">{user.status === "active" ? "离职" : "恢复在职"}</button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <div className="py-12 text-center text-sm text-gray-400">没有找到符合条件的员工</div>}
      </div>

      {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
        <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
          <div className="mb-5 flex items-center justify-between"><h3 className="text-lg font-semibold text-gray-800">{editingId ? "编辑员工" : "新增员工"}</h3><button type="button" onClick={() => setShowForm(false)} className="text-xl text-gray-400 hover:text-gray-600">×</button></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm text-gray-600">姓名<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-[#1e3a5f]" /></label>
            <label className="text-sm text-gray-600">部门<select required value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-[#1e3a5f]"><option value="">请选择部门</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
            <label className="text-sm text-gray-600">职位<input required value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-[#1e3a5f]" /></label>
            <label className="text-sm text-gray-600">角色<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as User["role"] })} className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-[#1e3a5f]"><option value="employee">员工</option><option value="manager">经理</option><option value="admin">管理员</option></select></label>
            <label className="text-sm text-gray-600">邮箱<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-[#1e3a5f]" /></label>
            <label className="text-sm text-gray-600">手机号<input required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-[#1e3a5f]" /></label>
          </div>
          {!editingId && <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-xs text-[#1e3a5f]">保存后系统会自动生成登录账号和一次性初始密码，并同步写入数据库。</p>}
          {formError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>}
          <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">取消</button><button disabled={saving} className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#2d5a8e] disabled:cursor-not-allowed disabled:opacity-50">{saving ? "正在创建..." : editingId ? "保存" : "保存并生成账号"}</button></div>
        </form>
      </div>}
      {issuedCredentials && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h3 className="text-lg font-semibold text-gray-800">员工账号已创建</h3><p className="mt-2 text-sm text-gray-500">请将以下账号信息安全交给 {issuedCredentials.name}。初始密码只在此处显示一次。</p><div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4"><div><div className="text-xs text-gray-400">登录账号</div><div className="mt-1 font-mono text-base font-semibold text-[#1e3a5f]">{issuedCredentials.username}</div></div><div><div className="text-xs text-gray-400">初始密码</div><div className="mt-1 font-mono text-base font-semibold text-[#1e3a5f]">{issuedCredentials.initialPassword}</div></div></div><button onClick={() => setIssuedCredentials(null)} className="mt-5 w-full rounded-lg bg-[#1e3a5f] px-4 py-2.5 text-sm font-medium text-white">我已记录，关闭</button></div></div>}
      {assignmentUser && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold text-gray-800">分配项目给 {assignmentUser.name}</h3><button onClick={() => setAssignmentUser(null)} className="text-xl text-gray-400">×</button></div><select value={assignmentProjectId} onChange={(event) => setAssignmentProjectId(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"><option value="">请选择项目</option>{projectOptions.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><div className="mt-5 flex justify-end gap-3"><button onClick={() => setAssignmentUser(null)} className="rounded-lg px-4 py-2 text-sm text-gray-600">取消</button><button onClick={saveAssignment} disabled={!assignmentProjectId} className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">确认分配</button></div></div></div>}
    </div>
  );
}
