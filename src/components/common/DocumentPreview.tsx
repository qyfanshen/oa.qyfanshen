"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Markmap } from "markmap-view";
import { Transformer } from "markmap-lib";

interface DocumentItem {
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

export default function DocumentPreview({ item, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<PreviewTab>("file");
  const [content, setContent] = useState<string | null>(null);
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
    if (activeTab !== "file") {
      setLoading(false);
      return;
    }
    if (isText && item.storageKey) {
      setLoading(true);
      fetch(fileUrl)
        .then((r) => {
          if (!r.ok) throw new Error("fetch failed");
          return r.text();
        })
        .then((t) => {
          setContent(t.slice(0, 100000));
          setLoading(false);
        })
        .catch(() => {
          setError("无法读取文件内容");
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
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

          {/* 图片缩放控制 */}
          {activeTab === "file" && isImage && !loading && (
            <div className="flex items-center gap-2 mr-3">
              <button onClick={() => setZoom((z) => Math.max(0.2, z - 0.2))} className="h-8 w-8 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">−</button>
              <span className="min-w-[3.5rem] text-center text-sm text-gray-600">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(5, z + 0.2))} className="h-8 w-8 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">+</button>
              <button onClick={() => setZoom(1)} className="ml-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">重置</button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <a href={downloadUrl} download={item.name} className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#2a4a73]">下载</a>
            <button onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">关闭</button>
          </div>
        </div>

        {/* Tabs - AI 功能（只对 PDF/Office 显示） */}
        {isConvertible && item.storageKey && (
          <div className="flex items-center gap-1 border-b border-gray-100 bg-white px-6">
            <TabButton active={activeTab === "file"} onClick={() => setActiveTab("file")} icon="📄" label="文件预览" />
            <TabButton active={activeTab === "summary"} onClick={() => setActiveTab("summary")} icon="📋" label="导读摘要" highlight />
            <TabButton active={activeTab === "mindmap"} onClick={() => setActiveTab("mindmap")} icon="🧠" label="思维导图" highlight />
            <TabButton active={activeTab === "chat"} onClick={() => setActiveTab("chat")} icon="💬" label="AI 提问" highlight />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-gray-100">
          {activeTab === "file" ? (
            <div className="h-full overflow-auto">
              {loading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-[#1e3a5f]"></div>
                    <p className="text-gray-500">正在加载...</p>
                  </div>
                </div>
              ) : error ? (
                <div className="flex h-full items-center justify-center text-red-500"><p>{error}</p></div>
              ) : isImage ? (
                <div className="flex min-h-full items-center justify-center p-6">
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

// ===== Tab 按钮组件 =====
function TabButton({ active, onClick, icon, label, highlight }: { active: boolean; onClick: () => void; icon: string; label: string; highlight?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
        active ? "text-[#1e3a5f]" : "text-gray-500 hover:text-gray-700"
      }`}
    >
      <span className="text-base">{icon}</span>
      <span>{label}</span>
      {highlight && !active && (
        <span className="absolute right-1 top-1 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-1.5 py-0.5 text-[9px] font-bold text-white">AI</span>
      )}
      {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1e3a5f]" />}
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
    <div className="h-full overflow-auto p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">📋 导读摘要</h2>
            <p className="mt-1 text-sm text-gray-500">AI 自动分析文档核心内容（{documentName}）</p>
          </div>
          <button
            onClick={() => generate(true)}
            disabled={loading}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            🔄 重新生成
          </button>
        </div>

        {loading ? (
          <AILoadingState text="正在阅读文档并生成摘要..." />
        ) : error ? (
          <AIErrorState error={error} onRetry={() => generate(false)} />
        ) : summary ? (
          <div className="rounded-2xl bg-white p-8 shadow-sm">
            {cached && (
              <div className="mb-4 inline-flex items-center gap-1 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                <span>✓</span> 已缓存，秒开
              </div>
            )}
            <div className="prose prose-lg max-w-none">
              <MarkdownRender content={summary} />
            </div>
            {charCount > 0 && (
              <div className="mt-6 border-t border-gray-100 pt-4 text-xs text-gray-400">
                文档共 {charCount.toLocaleString()} 字符
              </div>
            )}
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
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">🧠 思维导图</h2>
          <p className="text-xs text-gray-500">{documentName}</p>
        </div>
        <div className="flex items-center gap-2">
          {cached && (
            <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">✓ 缓存</span>
          )}
          <button
            onClick={() => generate(true)}
            disabled={loading}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            🔄 重新生成
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden bg-gradient-to-br from-blue-50 to-purple-50">
        {loading ? (
          <AILoadingState text="正在梳理文档结构..." />
        ) : error ? (
          <AIErrorState error={error} onRetry={() => generate(false)} />
        ) : (
          <svg ref={svgRef} className="h-full w-full" style={{ width: "100%", height: "100%" }} />
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
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">💬 AI 提问</h2>
          <p className="text-xs text-gray-500">基于「{documentName}」回答您的问题</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            🗑 清空对话
          </button>
        )}
      </div>

      {/* 消息区 */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center">
            <div className="mb-4 text-6xl">🤖</div>
            <h3 className="mb-2 text-lg font-semibold text-gray-700">开始提问</h3>
            <p className="mb-8 text-sm text-gray-500">基于文档内容回答您的问题</p>

            {loadingSuggestions ? (
              <div className="text-sm text-gray-400">加载推荐问题...</div>
            ) : suggestedQuestions.length > 0 ? (
              <div className="w-full max-w-2xl space-y-2">
                <p className="mb-3 text-sm font-medium text-gray-600">💡 您可以试试：</p>
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => ask(q)}
                    className="block w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-left text-sm text-gray-700 transition-colors hover:border-[#1e3a5f] hover:bg-blue-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((m) => (
              <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#1e3a5f] to-[#3b82f6] text-white text-sm">AI</div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    m.role === "user"
                      ? "bg-[#1e3a5f] text-white"
                      : m.error
                      ? "bg-red-50 text-red-700"
                      : "bg-white text-gray-800 shadow-sm"
                  }`}
                >
                  {m.loading && !m.content ? (
                    <div className="flex items-center gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "0ms" }} />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "150ms" }} />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "300ms" }} />
                    </div>
                  ) : (
                    <div className="prose prose-sm max-w-none">
                      {m.role === "assistant" ? <MarkdownRender content={m.content} /> : m.content}
                    </div>
                  )}
                </div>
                {m.role === "user" && (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-600 text-sm">👤</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="border-t border-gray-100 bg-white p-4">
        <div className="mx-auto flex max-w-3xl gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            placeholder="请输入您的问题，基于文档提问（Ctrl+回车发送）"
            rows={2}
            className="flex-1 resize-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm focus:border-[#1e3a5f] focus:bg-white focus:outline-none"
            disabled={streaming}
          />
          <button
            onClick={() => ask(input)}
            disabled={!input.trim() || streaming}
            className="rounded-lg bg-gradient-to-r from-[#1e3a5f] to-[#3b82f6] px-6 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
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
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-[#1e3a5f]"></div>
        <p className="text-gray-500">{text}</p>
      </div>
    </div>
  );
}

function AIErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="mb-4 text-5xl">⚠️</div>
        <p className="mb-4 text-red-600">{error}</p>
        <button
          onClick={onRetry}
          className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#2a4a73]"
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
  // 简单处理：保留换行和加粗
  const lines = content.split("\n");
  return (
    <div>
      {lines.map((line, i) => {
        if (line.startsWith("# ")) {
          return <h1 key={i} className="mb-3 mt-4 text-xl font-bold text-gray-800">{line.slice(2)}</h1>;
        }
        if (line.startsWith("## ")) {
          return <h2 key={i} className="mb-2 mt-3 text-lg font-bold text-gray-800">{line.slice(3)}</h2>;
        }
        if (line.startsWith("### ")) {
          return <h3 key={i} className="mb-1 mt-2 text-base font-semibold text-gray-700">{line.slice(4)}</h3>;
        }
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return <div key={i} className="flex gap-2 text-gray-700"><span>•</span><span>{formatInline(line.slice(2))}</span></div>;
        }
        if (/^\d+\.\s/.test(line)) {
          return <div key={i} className="flex gap-2 text-gray-700"><span>{line.match(/^\d+/)?.[0]}.</span><span>{formatInline(line.replace(/^\d+\.\s/, ""))}</span></div>;
        }
        if (line.trim() === "") return <div key={i} className="h-2" />;
        return <p key={i} className="text-gray-700 leading-relaxed">{formatInline(line)}</p>;
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
