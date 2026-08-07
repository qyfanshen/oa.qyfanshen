"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface ChatFilePreviewProps {
  messageId: string;
  fileName: string;
  fileSize: number | null;
  fileType: "image" | "file";
  onClose: () => void;
}

const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico"];
const PDF_EXTS = ["pdf"];
const WORD_EXTS = ["doc", "docx"];
const EXCEL_EXTS = ["xls", "xlsx"];
const PPT_EXTS = ["ppt", "pptx"];
const TEXT_EXTS = ["txt", "md", "json", "csv", "xml", "html", "css", "js", "ts", "log", "yml", "yaml", "ini", "conf"];

function getExt(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx === -1) return "";
  return name.slice(idx + 1).toLowerCase().trim();
}

function fileIcon(name: string): string {
  const ext = getExt(name);
  if (IMAGE_EXTS.includes(ext)) return "🖼️";
  if (PDF_EXTS.includes(ext)) return "📕";
  if (WORD_EXTS.includes(ext)) return "📘";
  if (EXCEL_EXTS.includes(ext)) return "📗";
  if (PPT_EXTS.includes(ext)) return "📙";
  if (TEXT_EXTS.includes(ext)) return "📝";
  return "📄";
}

function fileSizeText(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function ChatFilePreview({ messageId, fileName, fileSize, fileType, onClose }: ChatFilePreviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);

  const ext = getExt(fileName);
  const isImage = IMAGE_EXTS.includes(ext);
  const isPdf = PDF_EXTS.includes(ext);
  const isWord = WORD_EXTS.includes(ext);
  const isExcel = EXCEL_EXTS.includes(ext);
  const isPpt = PPT_EXTS.includes(ext);
  const isText = TEXT_EXTS.includes(ext);
  const isOffice = isWord || isExcel || isPpt;

  const previewUrl = `/api/chat/preview/${messageId}`;
  const downloadUrl = `/api/chat/files/${messageId}`;
  const inlineUrl = `${downloadUrl}?inline=1`;

  useEffect(() => {
    if (isText) {
      setLoading(true);
      fetch(previewUrl)
        .then((r) => {
          if (!r.ok) throw new Error("加载失败");
          return r.text();
        })
        .then((t) => {
          setTextContent(t);
          setLoading(false);
        })
        .catch((e) => {
          setError(e.message);
          setLoading(false);
        });
    } else if (isWord) {
      setLoading(true);
      fetch(previewUrl)
        .then((r) => {
          if (!r.ok) throw new Error("加载失败");
          return r.text();
        })
        .then(() => setLoading(false))
        .catch((e) => {
          setError(e.message);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [messageId, isText, isWord]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="relative flex h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 px-5 py-3">
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <span className="text-xl">{fileIcon(fileName)}</span>
            <h3 className="truncate text-base font-semibold text-gray-800" title={fileName}>{fileName}</h3>
            {fileSize && <span className="text-xs text-gray-400">{fileSizeText(fileSize)}</span>}
          </div>
          <div className="flex items-center gap-2">
            <a
              href={downloadUrl}
              download={fileName}
              className="rounded-lg bg-[#1e3a5f] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#2a4a73] transition-colors"
            >
              下载
            </a>
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              关闭
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-gray-100">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[#1e3a5f]"></div>
                <p className="text-sm text-gray-500">正在加载预览...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="mb-3 text-red-500">预览加载失败</p>
                <a href={downloadUrl} download={fileName} className="inline-block rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm text-white">
                  下载文件
                </a>
              </div>
            </div>
          ) : isImage ? (
            <div className="flex h-full items-center justify-center p-4 bg-gray-50">
              <img src={inlineUrl} alt={fileName} className="max-h-full max-w-full object-contain rounded-lg shadow-lg" />
            </div>
          ) : isPdf ? (
            <iframe src={inlineUrl} className="h-full w-full border-0" title={fileName} />
          ) : isWord ? (
            <iframe src={previewUrl} className="h-full w-full border-0 bg-white" title={fileName} />
          ) : isExcel ? (
            <iframe src={previewUrl} className="h-full w-full border-0 bg-white" title={fileName} />
          ) : isText && textContent !== null ? (
            <div className="h-full overflow-auto bg-slate-900 p-5">
              <pre className="font-mono text-sm leading-relaxed text-slate-100 whitespace-pre-wrap break-words">{textContent}</pre>
            </div>
          ) : isPpt ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg text-center">
                <div className="mb-4 text-6xl">📙</div>
                <h4 className="mb-2 text-lg font-semibold text-gray-800">{fileName}</h4>
                <p className="mb-4 text-sm text-gray-500">
                  PowerPoint 演示 · 暂不支持在线预览
                </p>
                <p className="mb-5 text-xs text-gray-400">请下载后用对应软件打开</p>
                <a href={downloadUrl} download={fileName} className="block w-full rounded-lg bg-[#1e3a5f] px-6 py-3 text-sm font-medium text-white hover:bg-[#2a4a73]">
                  下载文件
                </a>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg text-center">
                <div className="mb-4 text-6xl">📄</div>
                <h4 className="mb-2 text-lg font-semibold text-gray-800">{fileName}</h4>
                <p className="mb-4 text-sm text-gray-500">
                  {ext ? `.${ext} 格式` : "未知格式"} · 暂不支持在线预览
                </p>
                <a href={downloadUrl} download={fileName} className="block w-full rounded-lg bg-[#1e3a5f] px-6 py-3 text-sm font-medium text-white hover:bg-[#2a4a73]">
                  下载文件
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
