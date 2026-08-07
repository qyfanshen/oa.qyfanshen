import type { RowDataPacket } from "mysql2";
import { getDb } from "@/lib/db";

/**
 * 检查当前用户是否有权访问文档（下载/预览）
 * 管理员/经理 → 全部允许
 * 员工 → 公开 OR 自己上传 OR 在 viewers 列表
 */
export async function canAccessDocument(storageKey: string, accountId: number, role: string): Promise<boolean> {
  const isAdmin = ["admin", "superadmin", "manager"].includes(role);
  if (isAdmin) return true;

  const [empRows] = await getDb().execute<RowDataPacket[]>(
    "SELECT id FROM employees WHERE account_user_id = ? LIMIT 1",
    [accountId]
  );
  const myEmployeeId = empRows[0]?.id as string | undefined;
  if (!myEmployeeId) return false;

  const [docRows] = await getDb().execute<RowDataPacket[]>(
    "SELECT id, visibility, uploader_id FROM documents WHERE storage_key = ? LIMIT 1",
    [storageKey]
  );
  const doc = docRows[0];
  if (!doc) return false;

  if (doc.visibility === "all") return true;
  if (doc.uploader_id === myEmployeeId) return true;

  const [viewerRows] = await getDb().execute<RowDataPacket[]>(
    "SELECT 1 FROM document_viewers WHERE document_id = ? AND employee_id = ? LIMIT 1",
    [doc.id, myEmployeeId]
  );
  return viewerRows.length > 0;
}