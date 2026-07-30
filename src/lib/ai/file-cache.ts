/**
 * 文件缓存系统（替代数据库表）
 * 零侵入：不创建任何新表，AI 结果存在本地文件
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import path from "path";

const CACHE_DIR = path.join(process.cwd(), ".ai-cache");

// 确保缓存目录存在
function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCachePath(documentId: string, type: string): string {
  return path.join(CACHE_DIR, `${documentId}_${type}.json`);
}

interface CacheData {
  documentId: string;
  type: string;
  data: any;
  createdAt: string;
  updatedAt: string;
}

/**
 * 读取缓存
 */
export function getCache(documentId: string, type: string): CacheData | null {
  ensureCacheDir();
  const filePath = getCachePath(documentId, type);
  if (!existsSync(filePath)) return null;
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 写入缓存
 */
export function setCache(documentId: string, type: string, data: any): void {
  ensureCacheDir();
  const filePath = getCachePath(documentId, type);
  const now = new Date().toISOString();
  const cache: CacheData = {
    documentId,
    type,
    data,
    createdAt: now,
    updatedAt: now,
  };
  writeFileSync(filePath, JSON.stringify(cache, null, 2), "utf-8");
}

/**
 * 删除缓存（强制重新生成时用）
 */
export function deleteCache(documentId: string, type: string): void {
  const filePath = getCachePath(documentId, type);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}
