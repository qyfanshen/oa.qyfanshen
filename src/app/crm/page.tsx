"use client";

import { useEffect, useState, useMemo } from "react";
import type { Partner } from "@/types";

type PartnerRecord = Omit<Partner, "projects"> & { projectCount: number };

const typeLabels: Record<string, string> = {
  association: "商协会", college: "院校", enterprise: "企业",
};
const typeColors: Record<string, string> = {
  association: "bg-blue-100 text-blue-700 border-blue-200",
  college: "bg-emerald-100 text-emerald-700 border-emerald-200",
  enterprise: "bg-orange-100 text-orange-700 border-orange-200",
};
const statusColors: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-gray-100 text-gray-600",
  potential: "bg-amber-100 text-amber-700",
};
const statusLabels: Record<string, string> = {
  active: "合作中", inactive: "暂停", potential: "意向",
};

const filterTypes = [
  { key: "all", label: "全部" },
  { key: "association", label: "商协会" },
  { key: "college", label: "院校" },
  { key: "enterprise", label: "企业" },
];

export default function CrmPage() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [partnerList, setPartnerList] = useState<PartnerRecord[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newPartner, setNewPartner] = useState({ name: "", type: "enterprise" as Partner["type"], contactPerson: "", contactPhone: "", contactEmail: "", address: "", cooperation: "" });

  const loadPartners = async () => {
    const response = await fetch("/api/partners", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) setPartnerList(data.partners as PartnerRecord[]);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadPartners(); }, []);

  const filtered = useMemo(() => {
    let result = [...partnerList];
    if (typeFilter !== "all") {
      result = result.filter((p) => p.type === typeFilter);
    }
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(s) || p.cooperation.includes(s) || p.contactPerson.includes(s)
      );
    }
    return result;
  }, [partnerList, typeFilter, search]);

  const cycleStatus = async (id: string) => {
    const partner = partnerList.find((item) => item.id === id);
    if (!partner) return;
    const status = partner.status === "potential" ? "active" : partner.status === "active" ? "inactive" : "potential";
    const response = await fetch(`/api/partners/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (response.ok) await loadPartners();
  };

  const createPartner = async () => {
    if (!newPartner.name.trim() || !newPartner.contactPerson.trim() || !newPartner.contactPhone.trim()) return;
    const response = await fetch("/api/partners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newPartner) });
    if (!response.ok) return;
    await loadPartners();
    setNewPartner({ name: "", type: "enterprise", contactPerson: "", contactPhone: "", contactEmail: "", address: "", cooperation: "" }); setShowCreate(false);
  };

  const getProjectCount = (partner: PartnerRecord) => {
    return partner.projectCount;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-xl font-bold text-gray-800">客户管理</h2>
        <span className="text-sm text-gray-400">共 {partnerList.length} 家合作方</span>
      </div>

      <button onClick={() => setShowCreate(true)} className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white">+ 新增客户</button>
      {showCreate && <div className="rounded-xl border border-[#1e3a5f]/20 bg-white p-5 shadow-sm"><h3 className="mb-4 font-semibold text-gray-800">新增客户</h3><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><input value={newPartner.name} onChange={(e) => setNewPartner({ ...newPartner, name: e.target.value })} placeholder="客户名称" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" /><select value={newPartner.type} onChange={(e) => setNewPartner({ ...newPartner, type: e.target.value as Partner["type"] })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm"><option value="enterprise">企业</option><option value="association">商协会</option><option value="college">院校</option></select><input value={newPartner.contactPerson} onChange={(e) => setNewPartner({ ...newPartner, contactPerson: e.target.value })} placeholder="联系人" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" /><input value={newPartner.contactPhone} onChange={(e) => setNewPartner({ ...newPartner, contactPhone: e.target.value })} placeholder="联系电话" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" /><input value={newPartner.contactEmail} onChange={(e) => setNewPartner({ ...newPartner, contactEmail: e.target.value })} placeholder="联系邮箱（可选）" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" /><input value={newPartner.address} onChange={(e) => setNewPartner({ ...newPartner, address: e.target.value })} placeholder="地址（可选）" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div><textarea value={newPartner.cooperation} onChange={(e) => setNewPartner({ ...newPartner, cooperation: e.target.value })} placeholder="合作内容（可选）" rows={3} className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /><div className="mt-4 flex justify-end gap-3"><button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600">取消</button><button onClick={createPartner} className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm text-white">创建客户</button></div></div>}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {filterTypes.map((ft) => (
            <button
              key={ft.key}
              onClick={() => setTypeFilter(ft.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                typeFilter === ft.key
                  ? "bg-[#1e3a5f] text-white"
                  : "bg-white text-gray-500 border border-gray-200 hover:border-[#1e3a5f] hover:text-[#1e3a5f]"
              }`}
            >
              {ft.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 sm:max-w-xs sm:ml-auto">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text" placeholder="搜索客户名称、联系人..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
          />
        </div>
      </div>

      {/* Partner Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((partner) => (
          <div
            key={partner.id}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-all group"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 ${typeColors[partner.type] || "bg-gray-100 text-gray-600"}`}>
                  {typeLabels[partner.type]?.charAt(0) || partner.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{partner.name}</div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${typeColors[partner.type] || ""}`}>
                    {typeLabels[partner.type] || partner.type}
                  </span>
                </div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusColors[partner.status]}`}>
                {statusLabels[partner.status]}
              </span>
            </div>

            {/* Info */}
            <div className="space-y-1.5 mb-3 text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                {partner.contactPerson}
              </div>
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                {partner.contactPhone}
              </div>
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                <span className="truncate">{partner.address}</span>
              </div>
            </div>

            {/* Cooperation */}
            <div className="bg-gray-50 rounded-lg p-2.5 text-xs text-gray-600 mb-3">
              <span className="text-gray-400">合作内容：</span>
              {partner.cooperation}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-50">
              <button onClick={() => cycleStatus(partner.id)} className="text-xs text-[#1e3a5f] hover:underline">更新合作状态</button>
              <span className="text-xs text-gray-400">关联项目：{getProjectCount(partner)}个</span>
              <span className="text-[10px] text-gray-300">创建于 {partner.createdAt}</span>
            </div>
          </div>
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="text-center text-gray-400 py-12">暂无匹配的客户</div>
      )}
    </div>
  );
}
