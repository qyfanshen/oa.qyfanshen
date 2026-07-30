"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import DocumentPreview from "@/components/common/DocumentPreview";

type DocumentItem = {
  id: string;
  name: string;
  type: string;
  category: string;
  size: string;
  uploaderId: string;
  uploadDate: string;
  downloads: number;
  storageKey?: string;
  version: number;
};

const categories = ["全部", "人事制度", "财务制度", "技术规范", "商务模板", "工作报告", "项目方案", "安全制度"];

export default function DocumentsPage() {
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [role, setRole] = useState<"admin" | "employee">("employee");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("全部");
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState("项目方案");
  const [message, setMessage] = useState("");
  const [previewItem, setPreviewItem] = useState<DocumentItem | null>(null);

  const load = async () => {
    const [documentResponse, authResponse] = await Promise.all([
      fetch("/api/documents", { cache: "no-store" }),
      fetch("/api/auth/me"),
    ]);
    if (documentResponse.ok) {
      const data = await documentResponse.json();
      setItems(data.documents || []);
    }
    const auth = authResponse.ok ? await authResponse.json() : null;
    setRole(auth?.user?.role === "employee" ? "employee" : "admin");
  };
  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          (category === "全部" || item.category === category) &&
          (!search || item.name.toLowerCase().includes(search.toLowerCase()))
      ),
    [items, category, search]
  );

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] || null;
    setFile(next);
    if (next && !title) setTitle(next.name.replace(/\.[^.]+$/, ""));
  };

  const upload = async () => {
    if (!file) return;
    const body = new FormData();
    body.set("file", file);
    body.set("title", title || file.name);
    body.set("category", uploadCategory);
    const response = await fetch("/api/documents", { method: "POST", body });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.message || "上传失败");
      return;
    }
    setMessage("上传成功");
    setShowUpload(false);
    setFile(null);
    setTitle("");
    await load();
  };

  const download = (e: React.MouseEvent, item: DocumentItem) => {
    e.stopPropagation();
    if (item.storageKey) {
      // 通过 API 下载，自动保留原文件名
      const url = `/api/documents/download/${encodeURIComponent(item.storageKey)}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = item.name; // 显示原始文件名（含扩展名）
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800">文档管理</h2>
          <p className="mt-1 text-sm text-gray-400">公司资料库，所有内容来自数据库</p>
        </div>
        {role === "admin" && (
          <button
            onClick={() => setShowUpload(true)}
            className="rounded-lg bg-[#1e3a5f] px-4 py-2.5 text-sm text-white hover:bg-[#2a4a73] transition-colors"
          >
            + 上传文档
          </button>
        )}
      </div>

      {role === "employee" && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-[#1e3a5f]">
          员工可查看和下载公司资料，上传由管理员负责。
        </div>
      )}

      {message && (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>
      )}

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map((item) => (
          <button
            key={item}
            onClick={() => setCategory(item)}
            className={`rounded-lg px-3 py-2 text-xs transition-colors ${
              category === item ? "bg-[#1e3a5f] text-white" : "bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜索文档名称"
        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
      />

      {/* Document Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((item) => (
          <article
            key={item.id}
            onClick={() => setPreviewItem(item)}
            className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md hover:border-[#1e3a5f]/30 transition-all cursor-pointer group"
          >
            <div className="flex gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e3a5f]/10 text-xs font-bold text-[#1e3a5f]">
                {item.name.split(".").pop()?.toUpperCase().slice(0, 3) || "DOC"}
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  className="truncate text-sm font-medium text-gray-800 group-hover:text-[#1e3a5f] transition-colors"
                  title="点击预览"
                >
                  {item.name}
                </h3>
                <p className="mt-1 text-xs text-gray-400">
                  {item.size} · v{item.version}
                </p>
              </div>
            </div>
            <div className="mt-3 flex justify-between text-xs text-gray-400">
              <span>{item.category}</span>
              <span>{item.uploadDate}</span>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewItem(item);
                }}
                className="flex-1 rounded bg-[#1e3a5f]/5 px-3 py-1.5 text-xs text-[#1e3a5f] hover:bg-[#1e3a5f]/10 transition-colors"
              >
                预览
              </button>
              <button
                onClick={(e) => download(e, item)}
                className="flex-1 rounded bg-[#1e3a5f] px-3 py-1.5 text-xs text-white hover:bg-[#2a4a73] transition-colors"
              >
                下载
              </button>
            </div>
          </article>
        ))}
      </div>

      {!filtered.length && (
        <div className="rounded-xl bg-white py-12 text-center text-gray-400">暂无文档</div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">上传文档</h3>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="文档名称"
              className="mt-4 w-full rounded border p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
            />
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              className="mt-3 w-full rounded border p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
            >
              {categories.slice(1).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <input type="file" onChange={choose} className="mt-3 w-full text-sm" />
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowUpload(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                取消
              </button>
              <button
                disabled={!file}
                onClick={upload}
                className="rounded bg-[#1e3a5f] px-4 py-2 text-sm text-white disabled:opacity-40 hover:bg-[#2a4a73] transition-colors"
              >
                上传
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewItem && <DocumentPreview item={previewItem} onClose={() => setPreviewItem(null)} />}
    </div>
  );
}
