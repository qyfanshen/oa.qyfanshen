/**
 * 通知中心
 * - 接收方以 users.id 为准
 * - type: approval_pending | approval_approved | approval_rejected | system
 */
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { getDb } from "@/lib/db";

export const NOTIFICATION_TYPE = {
  approval_pending: "approval_pending",
  approval_approved: "approval_approved",
  approval_rejected: "approval_rejected",
  leave: "leave",
  expense: "expense",
  seal: "seal",
  document: "document",
  announcement: "announcement",
  system: "system",
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPE;

export interface CreateNotificationInput {
  recipientId: number;
  type: NotificationType | string;
  title: string;
  content?: string;
  relatedUrl?: string;
  relatedId?: string;
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  if (!input.recipientId || !input.title) return;
  try {
    await getDb().execute<ResultSetHeader>(
      "INSERT INTO notifications (recipient_id, type, title, content, related_url, related_id) VALUES (?, ?, ?, ?, ?, ?)",
      [
        input.recipientId,
        input.type,
        input.title.slice(0, 255),
        input.content ?? null,
        input.relatedUrl ?? null,
        input.relatedId ?? null,
      ]
    );
  } catch (error) {
    // 通知失败不影响主流程
    console.error("[notifications] create failed:", error);
  }
}

/**
 * 批量给多个用户发通知
 */
export async function createNotificationBatch(
  recipientIds: (number | undefined | null)[],
  payload: Omit<CreateNotificationInput, "recipientId">
): Promise<void> {
  const valid = Array.from(
    new Set(
      recipientIds.filter((x): x is number => Number.isInteger(x) && (x as number) > 0)
    )
  );
  if (valid.length === 0) return;
  const placeholders = valid.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
  const values: (number | string | null)[] = [];
  for (const id of valid) {
    values.push(
      id,
      payload.type,
      payload.title.slice(0, 255),
      payload.content ?? null,
      payload.relatedUrl ?? null,
      payload.relatedId ?? null
    );
  }
  try {
    await getDb().query(
      `INSERT INTO notifications (recipient_id, type, title, content, related_url, related_id) VALUES ${placeholders}`,
      values
    );
  } catch (error) {
    console.error("[notifications] batch create failed:", error);
  }
}

/**
 * 根据 employees.id 列表查出对应 user.id（用于按员工/部门发通知）
 */
export async function resolveUserIdsByEmployeeIds(
  employeeIds: string[]
): Promise<number[]> {
  if (employeeIds.length === 0) return [];
  const placeholders = employeeIds.map(() => "?").join(",");
  const [rows] = await getDb().query<RowDataPacket[]>(
    `SELECT account_user_id AS userId FROM employees WHERE id IN (${placeholders}) AND account_user_id IS NOT NULL`,
    employeeIds
  );
  return rows.map((r) => r.userId as number).filter((x) => Number.isInteger(x));
}
