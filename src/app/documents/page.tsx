"use client";

import { ChangeEvent, MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import DocumentPreview, {
  DocumentAiPanel,
  DocumentViewer,
  isAiSupported,
  type DocumentItem,
} from "@/components/common/DocumentPreview";

const categories = ["全部", "人事制度", "财务制度", "技术规范", "商务模板", "工作报告", "项目方案", "安全制度"];

export default function DocumentsPage() {
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; department: string; position: string }[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("全部");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [leftWidth, setLeftWidth] = useState(288);
  const [rightWidth, setRightWidth] = useState(380);
  const [dragSide, setDragSide] = useState<"left" | "right" | null>(null);
  const dragRef = useRef<{ side: "left" | "right"; startX: number; startWidth: number } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState("项目方案");
  const [visibility, setVisibility] = useState<"all" | "private">("all");
  const [selectedViewers, setSelectedViewers] = useState<string[]>([]);
  const [showViewerPicker, setShowViewerPicker] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    const [documentResponse, empResponse] = await Promise.all([
      fetch("/api/documents", { cache: "no-store" }),
      fetch("/api/employees?basic=1").catch(() => null),
    ]);
    if (documentResponse.ok) {
      const data = await documentResponse.json();
      setItems(data.documents || []);
    }
    if (empResponse?.ok) {
      const empData = await empResponse.json();
      setEmployees(empData.employees || []);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selectedId && items.length > 0) setSelectedId(items[0].id);
  }, [items, selectedId]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId]
  );

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
    body.set("visibility", visibility);
    if (visibility === "private" && selectedViewers.length > 0) {
      body.set("viewers", selectedViewers.join(","));
    }
    const response = await fetch("/api/documents", { method: "POST", body });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.message || "上传失败");
      return;
    }
    setMessage(visibility === "private" ? `上传成功（已指定 ${selectedViewers.length} 名可见人）` : "上传成功");
    setShowUpload(false);
    setFile(null);
    setTitle("");
    setVisibility("all");
    setSelectedViewers([]);
    setTimeout(() => setMessage(""), 3000);
    await load();
  };

  const download = (e: React.MouseEvent, item: DocumentItem) => {
    e.stopPropagation();
    if (item.storageKey) {
      const url = `/api/documents/download/${encodeURIComponent(item.storageKey)}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = item.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // ===== 左右栏拖拽拉伸（增量模式：宽度 = 起始宽度 + 鼠标位移，严格跟手） =====
  const startDrag = (side: "left" | "right") => (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragRef.current = {
      side,
      startX: e.clientX,
      startWidth: side === "left" ? leftWidth : rightWidth,
    };
    setDragSide(side);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    if (!dragSide) return;
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      // 按下后宽度不动，只有真正位移才改变宽度；向左拖为负增量，宽度收窄，不跳变不偏移
      const delta = e.clientX - d.startX;
      if (d.side === "left") {
        setLeftWidth(Math.min(440, Math.max(200, d.startWidth + delta)));
      } else {
        setRightWidth(Math.min(640, Math.max(300, d.startWidth - delta)));
      }
    };
    const onUp = () => {
      dragRef.current = null;
      setDragSide(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragSide]);

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[480px]">
      {/* ===== 左栏：文件列表 ===== */}
      <aside
        style={{ width: leftWidth }}
        className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-bold text-gray-800">文件列表</h3>
          <span className="text-xs text-gray-400">共 {items.length} 份文档</span>
        </div>
        <div className="shrink-0 px-3 pt-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索文档名称"
            className="mt-2 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
          />
        </div>

        {/* 分类筛选 */}
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-100 px-3 py-2">
          {categories.map((item) => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors ${
                category === item ? "bg-[#1e3a5f] text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {/* 文档列表 */}
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`mb-1 flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                selectedId === item.id
                  ? "border-[#1e3a5f]/30 bg-[#1e3a5f]/5"
                  : "border-transparent hover:bg-gray-50"
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1e3a5f]/10 text-[10px] font-bold text-[#1e3a5f]">
                {item.name.split(".").pop()?.toUpperCase().slice(0, 3) || "DOC"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-700" title={item.name}>
                  {item.name}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="truncate">{item.category} · {item.uploaderName || item.uploadDate}</span>
                  {item.visibility === "private" && (
                    <span className="shrink-0 rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-600">私密</span>
                  )}
                </p>
              </div>
            </button>
          ))}
          {!filtered.length && (
            <div className="py-10 text-center text-sm text-gray-400">暂无文档</div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="shrink-0 border-t border-gray-100 p-3">
          <button
            onClick={() => setShowUpload(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#1e3a5f] px-4 py-2.5 text-sm text-white transition-colors hover:bg-[#2a4a73]"
          >
            + 上传文档
          </button>
        </div>
      </aside>

      {/* 左分隔条：拖动调整左栏宽度 */}
      <Resizer side="left" dragging={dragSide === "left"} onStart={startDrag("left")} onReset={() => setLeftWidth(288)} />

      {/* ===== 中栏：文档预览 ===== */}
      <section
        className={`flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm ${
          dragSide ? "pointer-events-none" : ""
        }`}
      >
        {selected ? (
          <>
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/80 px-4 py-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-gray-800" title={selected.name}>
                  {selected.name}
                </h3>
                <p className="mt-0.5 text-xs text-gray-400">
                  {selected.category} · {selected.size} · v{selected.version} · {selected.uploadDate}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isAiSupported(selected.name) && selected.storageKey && (
                  <button
                    onClick={() => setShowAiModal(true)}
                    className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-600 transition-colors hover:bg-purple-100 lg:hidden"
                  >
                    <span className="font-extrabold tracking-wider">FS</span> AI 功能
                  </button>
                )}
                {selected.storageKey && (
                  <a
                    href={`/api/documents/download/${encodeURIComponent(selected.storageKey)}`}
                    download={selected.name}
                    className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#2a4a73]"
                  >
                    下载
                  </a>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-gray-100">
              <DocumentViewer key={selected.id} item={selected} />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="mb-3 text-5xl text-gray-200">📄</div>
              <p className="text-sm text-gray-400">从左侧选择一份文档进行预览</p>
            </div>
          </div>
        )}
      </section>

      {/* 右分隔条：拖动调整右栏宽度 */}
      <Resizer side="right" dragging={dragSide === "right"} onStart={startDrag("right")} onReset={() => setRightWidth(380)} />

      {/* ===== 右栏：AI 功能（导读摘要 / 思维导图 / AI提问） ===== */}
      <aside
        style={{ width: rightWidth }}
        className="hidden shrink-0 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm lg:flex"
      >
        {selected ? (
          <DocumentAiPanel key={selected.id} item={selected} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1e3a5f] to-[#3b82f6] text-xl font-extrabold tracking-widest text-white shadow-lg shadow-blue-900/25">FS</div>
              <p className="text-sm text-gray-400">选择文档后可使用 AI 功能</p>
            </div>
          </div>
        )}
      </aside>

      {/* 操作结果提示 */}
      {message && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-emerald-600 px-4 py-3 text-sm text-white shadow-lg">
          {message}
        </div>
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
            {/* 可见性选择 */}
            <div className="mt-3">
              <label className="text-xs font-medium text-gray-600">可见范围</label>
              <div className="mt-1.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => { setVisibility("all"); setSelectedViewers([]); }}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs ${
                    visibility === "all" ? "border-[#1e3a5f] bg-[#1e3a5f]/5 text-[#1e3a5f]" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  🌍 全员可见
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility("private")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs ${
                    visibility === "private" ? "border-orange-500 bg-orange-50 text-orange-600" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  🔒 指定人员
                </button>
              </div>
              {/* 指定人员选择 */}
              {visibility === "private" && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowViewerPicker(true)}
                    className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-xs hover:bg-gray-50"
                  >
                    <span className="text-gray-600">
                      {selectedViewers.length > 0 ? `已选 ${selectedViewers.length} 人` : "点击选择可见人"}
                    </span>
                    <span className="text-gray-400">›</span>
                  </button>
                  {selectedViewers.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedViewers.map((empId) => {
                        const emp = employees.find((e) => e.id === empId);
                        return emp ? (
                          <span key={empId} className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
                            {emp.name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <input type="file" onChange={choose} className="mt-3 w-full text-sm" />
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => { setShowUpload(false); setVisibility("all"); setSelectedViewers([]); }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                取消
              </button>
              <button
                disabled={!file || (visibility === "private" && selectedViewers.length === 0)}
                onClick={upload}
                className="rounded bg-[#1e3a5f] px-4 py-2 text-sm text-white disabled:opacity-40 hover:bg-[#2a4a73] transition-colors"
              >
                上传
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 选择可见人员工面板 */}
      {showViewerPicker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setShowViewerPicker(false)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h4 className="text-sm font-semibold">选择可见人员（共 {employees.length} 人）</h4>
              <button onClick={() => setShowViewerPicker(false)} className="text-xs text-gray-500 hover:text-gray-700">关闭</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-3">
              {employees.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">暂无员工数据</div>
              ) : (
                employees.map((emp) => {
                  const checked = selectedViewers.includes(emp.id);
                  return (
                    <label key={emp.id} className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 ${checked ? "bg-orange-50" : "hover:bg-gray-50"}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedViewers(
                            checked
                              ? selectedViewers.filter((id) => id !== emp.id)
                              : [...selectedViewers, emp.id]
                          );
                        }}
                        className="h-4 w-4 accent-orange-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-gray-800">{emp.name}</div>
                        <div className="text-xs text-gray-400">{emp.department} · {emp.position}</div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            <div className="border-t border-gray-100 p-3">
              <button onClick={() => setShowViewerPicker(false)} className="w-full rounded bg-[#1e3a5f] py-2 text-sm text-white">
                完成（已选 {selectedViewers.length} 人）
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 移动端 AI 功能弹窗 */}
      {showAiModal && selected && (
        <DocumentPreview item={selected} onClose={() => setShowAiModal(false)} />
      )}
    </div>
  );
}

// ===== 拖拽分隔条 =====
function Resizer({ side, dragging, onStart, onReset }: { side: "left" | "right"; dragging: boolean; onStart: (e: ReactMouseEvent<HTMLDivElement>) => void; onReset: () => void }) {
  return (
    <div
      onMouseDown={onStart}
      onDoubleClick={onReset}
      title="拖动调整宽度 · 双击恢复默认"
      className={`group flex w-3 shrink-0 cursor-col-resize items-center justify-center self-stretch transition-colors ${
        dragging ? "bg-[#1e3a5f]/10" : "hover:bg-[#1e3a5f]/5"
      } ${side === "right" ? "hidden lg:flex" : ""}`}
    >
      <div className={`h-14 w-1 rounded-full transition-all duration-200 ${
        dragging ? "bg-[#1e3a5f]" : "bg-gray-200 group-hover:bg-[#1e3a5f]/40"
      }`} />
    </div>
  );
}