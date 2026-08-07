"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Markmap } from "markmap-view";
import { Transformer } from "markmap-lib";

export interface DocumentItem {
  id: string;
  name: string;
  type: string;
  category: string;
  size: string;
  uploaderId: string;
  uploaderName?: string;
  uploadDate: string;
  downloads: number;
  storageKey?: string;
  version: number;
  visibility?: "all" | "private";
}

interface Props {
  item: DocumentItem;
  onClose: () => void;
}

type PreviewTab = "file" | "summary" | "mindmap" | "chat";

// 图片
const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico", "avif", "apng", "tiff", "tif"];
// 视频
const VIDEO_EXTS = ["mp4", "webm", "ogg", "mov", "m4v", "mkv", "avi", "flv", "wmv"];
// 音频
const AUDIO_EXTS = ["mp3", "wav", "ogg", "m4a", "flac", "aac", "wma", "opus", "ape"];
// 文本
const TEXT_EXTS = [
  "txt", "md", "markdown", "json", "xml", "yaml", "yml", "toml",
  "html", "htm", "css", "scss", "less", "sass",
  "js", "jsx", "ts", "tsx", "mjs", "cjs",
  "java", "kt", "swift", "go", "rs", "rb", "php",
  "py", "sh", "bash", "zsh", "fish", "ps1", "bat",
  "sql", "graphql", "gql",
  "log", "env", "conf", "ini", "properties", "cfg", "config",
  "csv", "tsv",
  "vue", "svelte", "dart", "lua", "pl", "r", "scala", "asm", "diff", "patch",
];
// Office
const OFFICE_EXTS = [
  "doc", "docx", "dot", "dotx", "docm",
  "xls", "xlsx", "xlt", "xltx", "xlsm",
  "ppt", "pptx", "pot", "potx", "pps", "ppsx", "pptm",
  "wps", "et", "dps", "wpt",
  "odt", "ods", "odp", "odb", "odf", "odg",
  "pages", "numbers", "key",
  "rtf", "mht", "mhtml", "epub",
];

/** 判断文档是否支持 AI 功能（仅 PDF / Office） */
export function isAiSupported(name: string): boolean {
  const ext = (name.split(".").pop()?.toLowerCase() || "").trim();
  return ext === "pdf" || OFFICE_EXTS.includes(ext);
}

export default function DocumentPreview({ item, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<PreviewTab>("file");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const ext = (item.name.split(".").pop()?.toLowerCase() || "").trim();
  const isImage = IMAGE_EXTS.includes(ext);
  const isPdf = ext === "pdf";
  const isVideo = VIDEO_EXTS.includes(ext);
  const isAudio = AUDIO_EXTS.includes(ext);
  const isText = TEXT_EXTS.includes(ext);
  const isOffice = OFFICE_EXTS.includes(ext);

  // 是否可走 LibreOffice 转换
  const isConvertible = isPdf || isOffice;

  const downloadUrl = item.storageKey
    ? `/api/documents/download/${encodeURIComponent(item.storageKey)}`
    : "";

  useEffect(() => {
    setZoom(1);
    if (activeTab !== "file") {
      setLoading(false);
      return;
    }
    setLoading(isText && !!item.storageKey);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, isText, activeTab]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="relative flex h-[92vh] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold text-gray-800" title={item.name}>
              {getTypeIcon(isImage, isPdf, isVideo, isAudio, isOffice, isText)} {item.name}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {item.category} · {item.size} · v{item.version}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a href={downloadUrl} download={item.name} className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#2a4a73]">下载</a>
            <button onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">关闭</button>
          </div>
        </div>

        {/* Tabs - AI 功能（只对 PDF/Office 显示） */}
        {isConvertible && item.storageKey && (
          <div className="flex items-center gap-1.5 border-b border-gray-100 bg-white px-6 py-2.5">
            <TabButton active={activeTab === "file"} onClick={() => setActiveTab("file")} icon="📄" label="文件预览" />
            <TabButton active={activeTab === "summary"} onClick={() => setActiveTab("summary")} icon="📋" label="导读摘要" highlight />
            <TabButton active={activeTab === "mindmap"} onClick={() => setActiveTab("mindmap")} icon="🧠" label="思维导图" highlight />
            <TabButton active={activeTab === "chat"} onClick={() => setActiveTab("chat")} icon="💬" label="AI提问" highlight />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-gray-100">
          {activeTab === "file" ? (
            <DocumentViewer item={item} loading={loading} error={error} />
          ) : activeTab === "summary" ? (
            <SummaryTab documentId={item.id} documentName={item.name} />
          ) : activeTab === "mindmap" ? (
            <MindmapTab documentId={item.id} documentName={item.name} />
          ) : (
            <ChatTab documentId={item.id} documentName={item.name} />
          )}
        </div>
      </div>
    </div>
  );
}

// ===== 文档预览器（弹窗与三栏中栏共用） =====
export function DocumentViewer({
  item,
  loading,
  error,
}: {
  item: DocumentItem;
  loading?: boolean;
  error?: string | null;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [innerLoading, setInnerLoading] = useState(false);
  const [innerError, setInnerError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const ext = (item.name.split(".").pop()?.toLowerCase() || "").trim();
  const isImage = IMAGE_EXTS.includes(ext);
  const isPdf = ext === "pdf";
  const isVideo = VIDEO_EXTS.includes(ext);
  const isAudio = AUDIO_EXTS.includes(ext);
  const isText = TEXT_EXTS.includes(ext);
  const isOffice = OFFICE_EXTS.includes(ext);

  const fileUrl = item.storageKey
    ? `/api/documents/download/${encodeURIComponent(item.storageKey)}?inline=1`
    : "";
  const downloadUrl = item.storageKey
    ? `/api/documents/download/${encodeURIComponent(item.storageKey)}`
    : "";
  const previewUrl = item.storageKey
    ? `/api/documents/preview/${encodeURIComponent(item.storageKey)}`
    : "";

  useEffect(() => {
    setZoom(1);
    setContent(null);
    if (isText && item.storageKey) {
      setInnerLoading(true);
      setInnerError(null);
      fetch(fileUrl)
        .then((r) => {
          if (!r.ok) throw new Error("fetch failed");
          return r.text();
        })
        .then((t) => {
          setContent(t.slice(0, 100000));
          setInnerLoading(false);
        })
        .catch(() => {
          setInnerError("无法读取文件内容");
          setInnerLoading(false);
        });
    } else {
      setInnerLoading(false);
      setInnerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, isText]);

  const isLoading = loading || innerLoading;
  const hasError = error || innerError;

  return (
    <div className="relative h-full overflow-auto bg-gray-100">
      {isLoading ? (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-[#1e3a5f]"></div>
            <p className="text-gray-500">正在加载...</p>
          </div>
        </div>
      ) : hasError ? (
        <div className="flex h-full items-center justify-center text-red-500"><p>{hasError}</p></div>
      ) : isImage ? (
        <div className="relative flex min-h-full items-center justify-center p-6">
          {isImage && (
            <div className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white/90 px-2 py-1.5 shadow-sm backdrop-blur">
              <button onClick={() => setZoom((z) => Math.max(0.2, z - 0.2))} className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 text-gray-600 hover:bg-gray-50">−</button>
              <span className="min-w-[3.5rem] text-center text-xs text-gray-600">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(5, z + 0.2))} className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 text-gray-600 hover:bg-gray-50">+</button>
              <button onClick={() => setZoom(1)} className="ml-0.5 rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">重置</button>
            </div>
          )}
          <img src={fileUrl} alt={item.name} style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }} className="max-w-full rounded-lg object-contain shadow-lg transition-transform" />
        </div>
      ) : isPdf ? (
        <iframe src={`${fileUrl}#toolbar=1&navpanes=1`} className="h-full w-full border-0" title={item.name} />
      ) : isOffice ? (
        <iframe src={previewUrl} className="h-full w-full border-0" title={item.name} />
      ) : isVideo ? (
        <div className="flex h-full items-center justify-center bg-black p-4">
          <video controls className="max-h-full max-w-full rounded-lg shadow-2xl" preload="metadata">
            <source src={fileUrl} />
            您的浏览器不支持视频播放。
          </video>
        </div>
      ) : isAudio ? (
        <div className="flex h-full items-center justify-center p-8">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg text-center">
            <div className="mb-6 text-7xl">🎵</div>
            <h4 className="mb-2 text-lg font-semibold text-gray-800">{item.name}</h4>
            <p className="mb-6 text-sm text-gray-500">{item.size}</p>
            <audio controls className="w-full" preload="metadata"><source src={fileUrl} /></audio>
          </div>
        </div>
      ) : isText && content !== null ? (
        <div className="h-full">
          <pre className="h-full overflow-auto bg-slate-900 p-6 font-mono text-sm leading-relaxed text-slate-100"><code>{content}</code></pre>
        </div>
      ) : (
        <UnsupportedHint name={item.name} ext={ext} downloadUrl={downloadUrl} />
      )}
    </div>
  );
}

// ===== AI 功能栏（可内嵌，用于三栏布局右侧区域） =====
export function DocumentAiPanel({ item }: { item: DocumentItem }) {
  const [activeTab, setActiveTab] = useState<"view" | "mindmap" | "chat">("view");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(false);
    setError(null);
  }, [item.id]);

  if (!isAiSupported(item.name)) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1e3a5f] to-[#3b82f6] text-xl font-extrabold tracking-widest text-white shadow-lg shadow-blue-900/25">FS</div>
          <p className="text-sm text-gray-400">该文档格式暂不支持 AI 功能</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* 标签栏 */}
      <div className="shrink-0 bg-gradient-to-r from-white via-gray-50/60 to-white px-3 py-2.5">
        <div className="flex items-center gap-1 rounded-xl bg-gray-100/90 p-1">
          <TabButton small active={activeTab === "view"} onClick={() => setActiveTab("view")} icon="📄" label="阅读" />
          <TabButton small active={activeTab === "mindmap"} onClick={() => setActiveTab("mindmap")} icon="🧠" label="思维导图" />
          <TabButton small active={activeTab === "chat"} onClick={() => setActiveTab("chat")} icon="💬" label="AI提问" />
        </div>
      </div>
      {/* 内容区 */}
      <div className="min-h-0 flex-1 bg-gradient-to-b from-gray-50/80 to-gray-100/60">
        {activeTab === "view" ? (
          <DocumentViewer item={item} loading={loading} error={error} />
        ) : activeTab === "mindmap" ? (
          <MindmapTab documentId={item.id} documentName={item.name} />
        ) : (
          <ChatTab documentId={item.id} documentName={item.name} />
        )}
      </div>
    </div>
  );
}

// ===== Tab 按钮（分段控件风格） =====
function TabButton({ active, onClick, icon, label, highlight, small }: { active: boolean; onClick: () => void; icon: string; label: string; highlight?: boolean; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-200 ${
        small ? "px-2 py-2 text-xs" : "px-4 py-2.5 text-sm"
      } ${
        active
          ? "bg-gradient-to-r from-[#1e3a5f] to-[#2a4a73] text-white shadow-sm"
          : "text-gray-500 hover:bg-white/80 hover:text-gray-700"
      }`}
    >
      <span className={`transition-transform duration-200 ${active ? "scale-110" : ""}`}>{icon}</span>
      <span>{label}</span>
      {highlight && !active && (
        <span className="absolute -right-1 -top-1 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">AI</span>
      )}
    </button>
  );
}

// ===== 摘要 Tab =====
function SummaryTab({ documentId, documentName }: { documentId: string; documentName: string }) {
  const [summary, setSummary] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [charCount, setCharCount] = useState(0);

  const generate = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/ai/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, force }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message || "生成失败");
      setSummary(data.summary);
      setCached(data.cached);
      setCharCount(data.charCount || 0);
    } catch (err: any) {
      setError(err?.message || "生成失败");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    generate();
  }, [generate]);

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-3xl">
        {/* 头部：渐变徽章 + 标题 + 重新生成 */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1e3a5f] to-[#3b82f6] text-lg shadow-md shadow-blue-900/20">
              📋
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-gray-800">导读摘要</h2>
              <p className="truncate text-xs text-gray-400">AI 自动分析文档核心内容 · {documentName}</p>
            </div>
          </div>
          <button
            onClick={() => generate(true)}
            disabled={loading}
            className="shrink-0 rounded-lg bg-gradient-to-r from-[#1e3a5f] to-[#2a4a73] px-4 py-2 text-xs font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0"
          >
            🔄 重新生成
          </button>
        </div>

        {loading ? (
          <AILoadingState text="正在阅读文档并生成摘要..." />
        ) : error ? (
          <AIErrorState error={error} onRetry={() => generate(false)} />
        ) : summary ? (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            {/* 三色渐变装饰条 */}
            <div className="h-1.5 bg-gradient-to-r from-[#1e3a5f] via-[#3b82f6] to-[#8b5cf6]" />
            <div className="p-6">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {cached && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-50 to-green-100 px-3 py-1 text-xs font-medium text-emerald-700">
                    <span>✓</span> 已缓存，秒开
                  </span>
                )}
                {charCount > 0 && (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">
                    文档共 {charCount.toLocaleString()} 字符
                  </span>
                )}
              </div>
              <div className="prose prose-lg max-w-none">
                <MarkdownRender content={summary} />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ===== 思维导图 Tab =====
function MindmapTab({ documentId, documentName }: { documentId: string; documentName: string }) {
  const [markdown, setMarkdown] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const markmapInstanceRef = useRef<any>(null);

  const generate = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/ai/mindmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, force }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message || "生成失败");
      setMarkdown(data.markdown);
      setCached(data.cached);
    } catch (err: any) {
      setError(err?.message || "生成失败");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  // 渲染思维导图
  useEffect(() => {
    if (!markdown || !svgRef.current) return;
    try {
      const transformer = new Transformer();
      const { root } = transformer.transform(markdown);
      if (markmapInstanceRef.current) {
        markmapInstanceRef.current.setData(root);
      } else {
        markmapInstanceRef.current = Markmap.create(svgRef.current, {
          autoFit: true,
          color: (node: any) => {
            const depth = node.state?.depth || 0;
            const colors = ["#1e3a5f", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b"];
            return colors[depth % colors.length] || "#6b7280";
          },
          paddingX: 16,
          duration: 300,
        }, root);
      }
    } catch (err) {
      console.error("[mindmap] render error:", err);
    }
  }, [markdown]);

  useEffect(() => {
    generate();
    return () => {
      if (markmapInstanceRef.current) {
        markmapInstanceRef.current.destroy?.();
        markmapInstanceRef.current = null;
      }
    };
  }, [generate]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-base shadow-md shadow-violet-500/20">
            🧠
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-gray-800">思维导图</h2>
            <p className="truncate text-xs text-gray-500">{documentName}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {cached && (
            <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">✓ 缓存</span>
          )}
          <button
            onClick={() => generate(true)}
            disabled={loading}
            className="rounded-lg bg-gradient-to-r from-[#1e3a5f] to-[#2a4a73] px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0"
          >
            🔄 重新生成
          </button>
        </div>
      </div>

      <div
        className="relative flex-1 overflow-hidden"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(59,130,246,0.16) 1px, transparent 0), linear-gradient(to bottom right, #eef4ff, #f6f2ff)",
          backgroundSize: "24px 24px, 100% 100%",
        }}
      >
        {loading ? (
          <AILoadingState text="正在梳理文档结构..." />
        ) : error ? (
          <AIErrorState error={error} onRetry={() => generate(false)} />
        ) : (
          <>
            <svg ref={svgRef} className="h-full w-full" style={{ width: "100%", height: "100%" }} />
            {markdown && (
              <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/60 bg-white/80 px-4 py-1.5 text-xs text-gray-500 shadow-sm backdrop-blur">
                🖱️ 滚轮缩放 · 拖拽平移 · 双击节点展开
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ===== AI 提问 Tab =====
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  loading?: boolean;
  error?: boolean;
}

function ChatTab({ documentId, documentName }: { documentId: string; documentName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 加载推荐问题
  useEffect(() => {
    const loadSuggestions = async () => {
      setLoadingSuggestions(true);
      try {
        const resp = await fetch("/api/ai/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId }),
        });
        const data = await resp.json();
        if (resp.ok) {
          setSuggestedQuestions(data.questions || []);
        }
      } catch {
        // 静默失败
      } finally {
        setLoadingSuggestions(false);
      }
    };
    loadSuggestions();
  }, [documentId]);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const ask = useCallback(
    async (question: string) => {
      if (!question.trim() || streaming) return;
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: question.trim(),
      };
      const aiMsgId = `a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: aiMsgId, role: "assistant", content: "", loading: true },
      ]);
      setInput("");
      setStreaming(true);

      try {
        const resp = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId, question: question.trim() }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.message || "请求失败");
        }
        const reader = resp.body?.getReader();
        if (!reader) throw new Error("无响应流");
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload);
              if (json.error) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId ? { ...m, content: json.error, loading: false, error: true } : m
                  )
                );
                return;
              }
              if (json.content) {
                fullText += json.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId ? { ...m, content: fullText, loading: false } : m
                  )
                );
              }
            } catch {
              // ignore parse error
            }
          }
        }
        setMessages((prev) =>
          prev.map((m) => (m.id === aiMsgId ? { ...m, loading: false } : m))
        );
      } catch (err: any) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId ? { ...m, content: err?.message || "提问失败", loading: false, error: true } : m
          )
        );
      } finally {
        setStreaming(false);
      }
    },
    [documentId, streaming]
  );

  return (
    <div className="flex h-full flex-col">
      {/* 头部 */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-base text-white shadow-md shadow-sky-500/20">
            💬
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-gray-800">AI 提问</h2>
            <p className="truncate text-xs text-gray-400">基于「{documentName}」回答您的问题</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500"
          >
            🗑 清空对话
          </button>
        )}
      </div>

      {/* 消息区 */}
      <div ref={scrollRef} className="flex-1 overflow-auto bg-gradient-to-b from-gray-50/60 to-gray-100/40 p-5">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[#1e3a5f] to-[#3b82f6] text-2xl font-extrabold tracking-widest text-white shadow-lg shadow-blue-900/25">
              FS
            </div>
            <h3 className="mb-1.5 text-lg font-semibold text-gray-800">开始提问</h3>
            <p className="mb-7 text-sm text-gray-500">基于文档内容回答您的问题</p>

            {loadingSuggestions ? (
              <div className="text-sm text-gray-400">加载推荐问题...</div>
            ) : suggestedQuestions.length > 0 ? (
              <div className="w-full max-w-2xl">
                <p className="mb-3 text-sm font-medium text-gray-600">💡 您可以试试：</p>
                <div className="space-y-2">
                  {suggestedQuestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => ask(q)}
                      className="group flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200/80 bg-white px-4 py-3 text-left text-sm text-gray-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#1e3a5f]/30 hover:shadow-md"
                    >
                      <span className="min-w-0 flex-1 truncate">{q}</span>
                      <span className="shrink-0 text-gray-300 transition-all duration-200 group-hover:translate-x-1 group-hover:text-[#1e3a5f]">→</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.map((m) => (
              <div key={m.id} className={`flex items-start gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#1e3a5f] to-[#3b82f6] text-xs font-bold text-white shadow-sm">AI</div>
                )}
                <div
                  className={`max-w-[82%] px-4 py-3 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "rounded-2xl rounded-br-md bg-gradient-to-br from-[#1e3a5f] to-[#2a4a73] text-white shadow-md shadow-blue-900/15"
                      : m.error
                        ? "rounded-2xl rounded-bl-md border border-red-100 bg-red-50 text-red-600"
                        : "rounded-2xl rounded-bl-md border border-gray-100 bg-white text-gray-700 shadow-sm"
                  }`}
                >
                  {m.loading && !m.content ? (
                    <div className="flex items-center gap-1.5 py-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[#1e3a5f]/60" style={{ animationDelay: "0ms" }} />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[#3b82f6]/60" style={{ animationDelay: "150ms" }} />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[#8b5cf6]/60" style={{ animationDelay: "300ms" }} />
                    </div>
                  ) : (
                    <div className="prose prose-sm max-w-none">
                      {m.role === "assistant" ? <MarkdownRender content={m.content} /> : m.content}
                    </div>
                  )}
                </div>
                {m.role === "user" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gray-200 to-gray-300 text-xs">👤</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="shrink-0 border-t border-gray-100 bg-white p-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <div className="flex-1 rounded-2xl border border-gray-200 bg-gray-50 p-2 pl-4 transition-all duration-200 focus-within:border-[#1e3a5f]/40 focus-within:bg-white focus-within:shadow-md">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(input);
                }
              }}
              placeholder="请输入您的问题，对本文档提问，Ctrl+回车发送"
              rows={2}
              className="w-full resize-none bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
              disabled={streaming}
            />
          </div>
          <button
            onClick={() => ask(input)}
            disabled={!input.trim() || streaming}
            className="relative shrink-0 rounded-xl bg-gradient-to-r from-[#1e3a5f] to-[#3b82f6] px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {streaming && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3b82f6] opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-[#3b82f6]"></span>
              </span>
            )}
            {streaming ? "思考中..." : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== 通用组件 =====
function AILoadingState({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center">
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-[#1e3a5f]/10 border-t-[#1e3a5f]"></div>
          <span className="text-xl">✨</span>
        </div>
        <p className="text-sm text-gray-500">{text}</p>
      </div>
    </div>
  );
}

function AIErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-red-100 bg-white p-6 text-center shadow-md shadow-red-100/40">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-red-400 to-rose-500 text-2xl">⚠️</div>
        <p className="mb-4 text-sm text-red-600">{error}</p>
        <button
          onClick={onRetry}
          className="rounded-lg bg-[#1e3a5f] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a4a73]"
        >
          重试
        </button>
      </div>
    </div>
  );
}

// 简易 Markdown 渲染（避免引入额外库）
function MarkdownRender({ content }: { content: string }) {
  if (!content) return null;
  const lines = content.split("\n");
  return (
    <div>
      {lines.map((line, i) => {
        if (line.startsWith("> ")) {
          return (
            <div key={i} className="mb-3 rounded-r-xl border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-amber-800">
              {formatInline(line.slice(2))}
            </div>
          );
        }
        if (line.startsWith("# ")) {
          return (
            <h1 key={i} className="mb-3 mt-4 flex items-center gap-2 text-xl font-bold text-gray-800">
              <span className="h-5 w-1 rounded-full bg-gradient-to-b from-[#1e3a5f] to-[#3b82f6]" />
              {line.slice(2)}
            </h1>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <h2 key={i} className="mb-2 mt-3 flex items-center gap-2 text-lg font-bold text-gray-800">
              <span className="h-5 w-1 rounded-full bg-gradient-to-b from-[#3b82f6] to-[#8b5cf6]" />
              {line.slice(3)}
            </h2>
          );
        }
        if (line.startsWith("### ")) {
          return <h3 key={i} className="mb-1 mt-2 text-base font-semibold text-gray-700">{line.slice(4)}</h3>;
        }
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <div key={i} className="flex items-start gap-2 text-gray-700">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6]" />
              <span>{formatInline(line.slice(2))}</span>
            </div>
          );
        }
        if (/^\d+\.\s/.test(line)) {
          return (
            <div key={i} className="flex items-start gap-2 text-gray-700">
              <span className="shrink-0 font-semibold text-[#1e3a5f]">{line.match(/^\d+/)?.[0]}.</span>
              <span>{formatInline(line.replace(/^\d+\.\s/, ""))}</span>
            </div>
          );
        }
        if (line.trim() === "") return <div key={i} className="h-2" />;
        return <p key={i} className="leading-relaxed text-gray-700">{formatInline(line)}</p>;
      })}
    </div>
  );
}

function formatInline(text: string): React.ReactNode {
  // 处理 **加粗**
  const parts: React.ReactNode[] = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<strong key={key++} className="font-bold text-gray-900">{match[1]}</strong>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}

function getTypeIcon(isImage: boolean, isPdf: boolean, isVideo: boolean, isAudio: boolean, isOffice: boolean, isText: boolean) {
  if (isImage) return "🖼️";
  if (isPdf) return "📕";
  if (isVideo) return "🎬";
  if (isAudio) return "🎵";
  if (isOffice) return "📊";
  if (isText) return "📝";
  return "📄";
}

function UnsupportedHint({ name, ext, downloadUrl }: { name: string; ext: string; downloadUrl: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg text-center">
        <div className="mb-4 text-7xl">📦</div>
        <h4 className="mb-2 text-xl font-semibold text-gray-800">{name}</h4>
        <p className="mb-1 text-sm text-gray-500">{ext ? `.${ext} 格式` : "未知格式"} · 暂不支持在线预览</p>
        <p className="mb-6 text-sm text-gray-400">请下载后用对应软件打开</p>
        <a href={downloadUrl} download={name} className="block w-full rounded-lg bg-[#1e3a5f] px-6 py-3 text-sm font-medium text-white hover:bg-[#2a4a73]">下载文件</a>
      </div>
    </div>
  );
}