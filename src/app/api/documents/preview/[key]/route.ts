import { createReadStream, existsSync, mkdirSync, statSync } from "fs";
import { exec } from "child_process";
import path from "path";
import { promisify } from "util";
import { createHash } from "crypto";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import { SESSION_COOKIE, readSession, getSessionFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canAccessDocument } from "@/lib/documentAccess";

const execAsync = promisify(exec);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const uploadDir = path.join(process.cwd(), "uploads");
const cacheDir = path.join(uploadDir, "cache");

// Office 文档扩展名（需要转 PDF 的）
const OFFICE_EXTS = [
  "doc", "docx", "dot", "dotx", "docm",
  "xls", "xlsx", "xlt", "xltx", "xlsm",
  "ppt", "pptx", "pot", "potx", "pps", "ppsx", "pptm",
  "wps", "et", "dps", "wpt",
  "odt", "ods", "odp", "odb", "odf", "odg",
  "rtf", "mht", "mhtml",
];

// LibreOffice Docker 容器名（linuxserver/libreoffice 默认容器名）
const LIBREOFFICE_CONTAINER = process.env.LIBREOFFICE_CONTAINER || "libreoffice";
let resolvedContainer: string | null = null;

async function getContainerName(): Promise<string | null> {
  if (resolvedContainer) return resolvedContainer;
  try {
    // 查找运行中的 libreoffice 容器
    const { stdout } = await execAsync(
      `docker ps --filter "ancestor=lscr.io/linuxserver/libreoffice" --format "{{.Names}}" 2>/dev/null | head -1`
    );
    const name = stdout.trim();
    if (name) {
      resolvedContainer = name;
      return name;
    }
  } catch {
    // ignore
  }
  // 回退：找名字含 libreoffice 的容器
  try {
    const { stdout } = await execAsync(
      `docker ps --format "{{.Names}}" | grep -i libreoffice | head -1`
    );
    const name = stdout.trim();
    if (name) {
      resolvedContainer = name;
      return name;
    }
  } catch {
    // ignore
  }
  return null;
}

function getCachePath(storageKey: string): string {
  const hash = createHash("md5").update(storageKey).digest("hex");
  return path.join(cacheDir, `${hash}.pdf`);
}

// 在容器内转换 Office 文档为 PDF
async function convertToPdf(srcFile: string, storageKey: string, container: string): Promise<string> {
  const ext = path.extname(storageKey);
  // 容器内的临时文件名（用 lo-src- 前缀避免和原文件名冲突）
  const containerSrc = `/tmp/lo-src-${Date.now()}${ext}`;
  const containerOutDir = "/tmp";
  // 主机上的目标路径
  const destPath = getCachePath(storageKey);

  try {
    // 1. 把源文件拷到容器内
    await execAsync(`docker cp "${srcFile}" ${container}:${containerSrc}`, { timeout: 30000 });

    // 2. 在容器内转 PDF
    const convertCmd = `docker exec ${container} soffice --headless --norestore --nologo --nofirststartwizard --invisible --convert-to pdf --outdir ${containerOutDir} ${containerSrc}`;
    console.log("[convert] executing:", convertCmd);
    const { stdout, stderr } = await execAsync(convertCmd, {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (stderr && !stderr.includes("Warning")) {
      console.warn("[convert] stderr:", stderr);
    }
    if (stdout) {
      console.log("[convert] stdout:", stdout);
    }

    // 3. 容器内实际生成的 PDF 路径（soffice 用源文件 basename + .pdf）
    const actualPdfInContainer = containerSrc.replace(/\.[^.]+$/, ".pdf");
    console.log("[convert] expecting PDF at:", actualPdfInContainer);

    // 4. 拷回主机
    await execAsync(`docker cp ${container}:${actualPdfInContainer} "${destPath}"`, { timeout: 30000 });

    return destPath;
  } catch (err: any) {
    console.error("[convert] error:", err?.message || err);
    throw new Error(`Office 转换 PDF 失败: ${err?.message || err}`);
  } finally {
    // 5. 清理容器内临时文件
    try {
      await execAsync(`docker exec ${container} rm -f ${containerSrc} ${containerSrc.replace(/\.[^.]+$/, ".pdf")} 2>/dev/null`);
    } catch {
      // ignore
    }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  // 1. 鉴权
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "请先登录后再预览。" }, { status: 401 });
  }

  // 2. 获取 storageKey
  const { key: rawKey } = await params;
  if (!rawKey) {
    return NextResponse.json({ message: "参数错误。" }, { status: 400 });
  }

  const storageKey = decodeURIComponent(rawKey);

  // 3. 安全检查
  if (storageKey.includes("..") || storageKey.includes("/") || storageKey.includes("\\")) {
    return NextResponse.json({ message: "非法文件名。" }, { status: 400 });
  }

  // 3.5 文档可见性权限检查
  const allowed = await canAccessDocument(storageKey, session.id, session.role);
  if (!allowed) {
    return NextResponse.json({ message: "无权访问此文档。" }, { status: 403 });
  }

  const ext = path.extname(storageKey).toLowerCase().replace(".", "");

  // 4. 如果不是 Office 文档，重定向到下载 API
  if (!OFFICE_EXTS.includes(ext)) {
    const downloadUrl = `/api/documents/download/${encodeURIComponent(storageKey)}?inline=1`;
    return NextResponse.redirect(new URL(downloadUrl, request.url));
  }

  // 5. 查找 LibreOffice 容器
  const container = await getContainerName();
  if (!container) {
    return NextResponse.json(
      {
        message: "未找到 LibreOffice 容器，无法在线预览 Office 文档。",
        hint: "请确保 libreoffice docker 容器在运行：docker ps | grep libreoffice",
      },
      { status: 503 }
    );
  }

  const filePath = path.join(uploadDir, storageKey);
  if (!existsSync(filePath)) {
    return NextResponse.json({ message: "文件不存在。" }, { status: 404 });
  }

  // 6. 检查缓存
  mkdirSync(cacheDir, { recursive: true });
  const cachePath = getCachePath(storageKey);

  let pdfPath = cachePath;
  if (!existsSync(cachePath)) {
    // 7. 转换
    console.log(`[preview] converting ${storageKey} via container ${container}...`);
    try {
      pdfPath = await convertToPdf(filePath, storageKey, container);
    } catch (err: any) {
      return NextResponse.json(
        {
          message: "Office 文档转换 PDF 失败。",
          error: err?.message,
        },
        { status: 500 }
      );
    }
  } else {
    console.log(`[preview] cache hit for ${storageKey}`);
  }

  // 8. 流式返回 PDF
  if (!existsSync(pdfPath)) {
    return NextResponse.json({ message: "PDF 生成失败。" }, { status: 500 });
  }

  const fileStat = statSync(pdfPath);
  const stream = createReadStream(pdfPath);
  const webStream = Readable.toWeb(stream) as ReadableStream;

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(fileStat.size),
      "Content-Disposition": `inline; filename="preview.pdf"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
