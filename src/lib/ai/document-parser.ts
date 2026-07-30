/**
 * 文档文本提取器
 * 支持 PDF / Word (.docx) / 纯文本
 * 老格式 .doc / .wps / .et / .dps 在有 Docker+LibreOffice 容器时优先用，否则降级
 *
 * 解析策略（自动选择最佳路径）：
 * 1. PDF  → pdf-parse（纯 JS）
 * 2. .docx → mammoth（纯 JS，跨平台，**推荐本地用**）
 * 3. .docx → 若 mammoth 不可用且有 Docker 容器 → LibreOffice 转 PDF → pdf-parse
 * 4. 其他 Office（.doc/.wps/.xls/.ppt...）→ 必须 Docker+LibreOffice
 * 5. 文本 → fs.readFileSync
 */

import { exec } from "child_process";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

const uploadDir = path.join(process.cwd(), "uploads");

const LIBREOFFICE_CONTAINER = process.env.LIBREOFFICE_CONTAINER || "libreoffice";

const OFFICE_EXTS = [
  "doc", "docx", "wps", "wpt", "rtf",
  "xls", "xlsx", "et",
  "ppt", "pptx", "dps",
  "odt", "ods", "odp",
];

// 只有 mammoth 真正支持的格式（.docx）
const MAMMOTH_EXTS = ["docx"];

const PDF_EXTS = ["pdf"];
const TEXT_EXTS = [
  "txt", "md", "json", "xml", "html", "htm",
  "csv", "tsv", "log", "env", "ini",
  "js", "ts", "jsx", "tsx", "java", "py", "go", "rs", "rb", "php", "sh", "sql",
  "yaml", "yml", "css", "scss", "vue", "svelte",
];

export function detectFileType(filename: string): "pdf" | "office" | "text" | "unknown" {
  const ext = path.extname(filename).toLowerCase().replace(".", "");
  if (PDF_EXTS.includes(ext)) return "pdf";
  if (OFFICE_EXTS.includes(ext)) return "office";
  if (TEXT_EXTS.includes(ext)) return "text";
  return "unknown";
}

/**
 * 检测 Docker 是否可用
 */
let dockerAvailableCache: boolean | null = null;
async function isDockerAvailable(): Promise<boolean> {
  if (dockerAvailableCache !== null) return dockerAvailableCache;
  try {
    await execAsync(`docker --version`, { timeout: 3000 });
    // 进一步检测容器是否存在
    await execAsync(`docker inspect ${LIBREOFFICE_CONTAINER}`, { timeout: 3000 });
    dockerAvailableCache = true;
  } catch {
    dockerAvailableCache = false;
  }
  return dockerAvailableCache;
}

/**
 * 检测 mammoth 是否安装
 */
let mammothAvailableCache: boolean | null = null;
function isMammothAvailable(): boolean {
  if (mammothAvailableCache !== null) return mammothAvailableCache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require.resolve("mammoth");
    mammothAvailableCache = true;
  } catch {
    mammothAvailableCache = false;
  }
  return mammothAvailableCache;
}

/**
 * PDF 文本提取
 */
async function extractPdf(filePath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse");
  const buffer = readFileSync(filePath);
  const result = await pdfParse(buffer);
  return result.text || "";
}

/**
 * .docx 纯 JS 提取（mammoth）
 */
async function extractDocx(filePath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require("mammoth");
  const buffer = readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

/**
 * Office 文档：先转 PDF，再提取
 */
async function extractOfficeViaDocker(filePath: string): Promise<string> {
  const ext = path.extname(filePath);
  const timestamp = Date.now();
  const baseName = path.basename(filePath, ext);
  const containerSrc = `/tmp/parse-src-${timestamp}${ext}`;
  const containerOutDir = "/tmp";
  const tmpLocalPdf = path.join("/tmp", `parse-${timestamp}.pdf`);

  try {
    // 1. 源文件拷到容器
    await execAsync(
      `docker cp "${filePath}" ${LIBREOFFICE_CONTAINER}:${containerSrc}`,
      { timeout: 30000 }
    );

    // 2. 容器内转 PDF
    await execAsync(
      `docker exec ${LIBREOFFICE_CONTAINER} soffice --headless --norestore --nologo --invisible --convert-to pdf --outdir ${containerOutDir} ${containerSrc}`,
      { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
    );

    // 3. 拷回主机（容器内 soffice 输出文件名 = src 替换扩展名）
    const containerPdf = containerSrc.replace(/\.[^.]+$/, ".pdf");
    await execAsync(
      `docker cp ${LIBREOFFICE_CONTAINER}:${containerPdf} ${tmpLocalPdf}`,
      { timeout: 30000 }
    );

    if (!existsSync(tmpLocalPdf)) {
      throw new Error("Office 转 PDF 失败：临时文件未生成");
    }
    const text = await extractPdf(tmpLocalPdf);
    return text;
  } finally {
    try {
      await execAsync(
        `docker exec ${LIBREOFFICE_CONTAINER} rm -f ${containerSrc} ${containerSrc.replace(/\.[^.]+$/, ".pdf")}`,
        { timeout: 5000 }
      );
    } catch {
      // ignore
    }
    try {
      const fs = await import("fs/promises");
      await fs.unlink(tmpLocalPdf).catch(() => {});
    } catch {
      // ignore
    }
  }
}

/**
 * 智能 Office 文档提取
 * 优先 mammoth（本地）→ Docker LibreOffice（服务器）
 */
async function extractOffice(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase().replace(".", "");

  // .docx 且 mammoth 可用 → 纯 JS 解析
  if (MAMMOTH_EXTS.includes(ext) && isMammothAvailable()) {
    try {
      console.log(`[parser] using mammoth for ${ext}`);
      return await extractDocx(filePath);
    } catch (err: any) {
      console.warn(`[parser] mammoth failed: ${err.message}, falling back to docker`);
    }
  }

  // 尝试 Docker 路径
  if (await isDockerAvailable()) {
    try {
      console.log(`[parser] using docker libreoffice for ${ext}`);
      return await extractOfficeViaDocker(filePath);
    } catch (err: any) {
      console.warn(`[parser] docker libreoffice failed: ${err.message}`);
    }
  }

  // 都不可用：给出清晰错误
  if (MAMMOTH_EXTS.includes(ext) && !isMammothAvailable()) {
    throw new Error(
      `本地无法解析 .${ext} 文件。请安装 mammoth：npm install mammoth`
    );
  }
  throw new Error(
    `本地无法解析 .${ext} 文件。请确保：(1) 安装 mammoth 处理 .docx；(2) 部署 LibreOffice Docker 容器处理其他 Office 格式。`
  );
}

/**
 * 纯文本提取
 */
function extractText(filePath: string): string {
  return readFileSync(filePath, "utf-8");
}

/**
 * 主入口
 */
export async function parseDocument(storageKey: string): Promise<{
  type: "pdf" | "office" | "text" | "unknown";
  text: string;
  charCount: number;
}> {
  const filePath = path.join(uploadDir, storageKey);
  if (!existsSync(filePath)) {
    throw new Error(`文件不存在: ${storageKey}`);
  }
  const type = detectFileType(storageKey);
  let text = "";
  switch (type) {
    case "pdf":
      text = await extractPdf(filePath);
      break;
    case "office":
      text = await extractOffice(filePath);
      break;
    case "text":
      text = extractText(filePath);
      break;
    default:
      throw new Error(`不支持的文件类型: ${storageKey}`);
  }
  text = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { type, text, charCount: text.length };
}
