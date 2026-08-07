import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
const chatUploadDir = path.join(process.cwd(), "uploads", "chat");

// POST /api/chat/upload  聊天文件上传（单文件，multipart，name=file）
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "缺少文件" }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ message: "文件不能超过 20MB" }, { status: 400 });
  }

  await mkdir(chatUploadDir, { recursive: true });
  const ext = path.extname(file.name).toLowerCase().slice(0, 20);
  const safeName = path.basename(file.name).replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
  const storageName = `${Date.now()}-${randomBytes(4).toString("hex")}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(chatUploadDir, storageName), buffer);

  const url = `/uploads/chat/${storageName}`;
  const isImage = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"].includes(file.type);

  return NextResponse.json({
    url,
    fileName: safeName,
    fileSize: file.size,
    fileType: file.type,
    type: isImage ? "image" : "file",
  }, { status: 201 });
}
