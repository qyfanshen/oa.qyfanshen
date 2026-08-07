/**
 * 即时通讯核心逻辑
 * - 会话：私聊 private / 部门群 group
 * - 消息：text / image / file / system
 * - 未读数：last_read_at 之后的消息数
 */
import { randomBytes } from "crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { getDb } from "@/lib/db";

export type ChatMessageType = "text" | "image" | "file" | "system";

interface ConversationRow extends RowDataPacket {
  id: string;
  type: "private" | "group";
  name: string | null;
  group_key: string | null;
}

interface MemberRow extends RowDataPacket {
  user_id: number;
  name: string;
}

function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${randomBytes(4).toString("hex")}`;
}

/** 获取用户的员工/部门信息（用于群成员展示） */
async function userDept(userId: number): Promise<string> {
  const [rows] = await getDb().execute<RowDataPacket[]>(
    "SELECT department FROM employees WHERE account_user_id = ? LIMIT 1",
    [userId]
  );
  return (rows[0]?.department as string) || "";
}

/**
 * 找或创建私聊会话（两人）
 * 私聊会话 key 用较小的 user id 前缀保证唯一
 */
export async function findOrCreatePrivateConversation(
  userA: number,
  userB: number
): Promise<string> {
  if (userA === userB) throw new Error("不能和自己聊天");
  const key = userA < userB ? `${userA}_${userB}` : `${userB}_${userA}`;

  // 查已有私聊
  const [rows] = await getDb().execute<RowDataPacket[]>(
    "SELECT id FROM chat_conversations WHERE type='private' AND group_key = ? LIMIT 1",
    [key]
  );
  if (rows[0]) {
    const convoId = rows[0].id as string;
    // 确保两个成员都在
    for (const uid of [userA, userB]) {
      await getDb().execute(
        "INSERT IGNORE INTO chat_conversation_members (conversation_id, user_id) VALUES (?, ?)",
        [convoId, uid]
      );
    }
    return convoId;
  }

  // 创建新私聊
  const convoId = genId("chat");
  const conn = await getDb().getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      "INSERT INTO chat_conversations (id, type, name, group_key, created_by) VALUES (?, 'private', NULL, ?, ?)",
      [convoId, key, userA]
    );
    await conn.execute(
      "INSERT INTO chat_conversation_members (conversation_id, user_id) VALUES (?, ?), (?, ?)",
      [convoId, userA, convoId, userB]
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    // 并发下可能已创建，回查一次
    const [again] = await getDb().execute<RowDataPacket[]>(
      "SELECT id FROM chat_conversations WHERE type='private' AND group_key = ? LIMIT 1",
      [key]
    );
    if (again[0]) return again[0].id as string;
    throw e;
  } finally {
    conn.release();
  }
  return convoId;
}

/** 找或创建部门群聊（全员入群） */
export async function findOrCreateDepartmentGroup(
  department: string
): Promise<string | null> {
  if (!department) return null;
  const groupKey = `dept:${department}`;

  const [rows] = await getDb().execute<RowDataPacket[]>(
    "SELECT id FROM chat_conversations WHERE type='group' AND group_key = ? LIMIT 1",
    [groupKey]
  );
  if (rows[0]) return rows[0].id as string;

  // 查该部门所有员工
  const [members] = await getDb().execute<RowDataPacket[]>(
    "SELECT account_user_id AS userId FROM employees WHERE department = ? AND account_user_id IS NOT NULL AND status = 'active'",
    [department]
  );
  if (members.length === 0) return null;

  const convoId = genId("chat");
  const conn = await getDb().getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      "INSERT INTO chat_conversations (id, type, name, group_key, created_by) VALUES (?, 'group', ?, ?, NULL)",
      [convoId, `${department}群`, groupKey]
    );
    for (const m of members) {
      await conn.execute(
        "INSERT IGNORE INTO chat_conversation_members (conversation_id, user_id) VALUES (?, ?)",
        [convoId, m.userId]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    const [again] = await getDb().execute<RowDataPacket[]>(
      "SELECT id FROM chat_conversations WHERE type='group' AND group_key = ? LIMIT 1",
      [groupKey]
    );
    if (again[0]) return again[0].id as string;
    throw e;
  } finally {
    conn.release();
  }
  return convoId;
}

/** 发送消息（持久化），返回完整消息对象 */
export async function insertMessage(input: {
  conversationId: string;
  senderId: number;
  type: ChatMessageType;
  content: string;
  fileName?: string | null;
  fileSize?: number | null;
  fileUrl?: string | null;
}): Promise<{
  id: string;
  conversationId: string;
  senderId: number;
  senderName: string;
  senderAvatar: string;
  type: ChatMessageType;
  content: string;
  fileName: string | null;
  fileSize: number | null;
  fileUrl: string | null;
  recalled: boolean;
  createdAt: string;
}> {
  const id = genId("msg");
  await getDb().execute<ResultSetHeader>(
    "INSERT INTO chat_messages (id, conversation_id, sender_id, type, content, file_name, file_size, file_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      input.conversationId,
      input.senderId,
      input.type,
      input.content.slice(0, 5000),
      input.fileName ?? null,
      input.fileSize ?? null,
      input.fileUrl ?? null,
    ]
  );
  return getMessageById(id) as Promise<any>;
}

/** 查单条消息（含发送人信息） */
export async function getMessageById(id: string) {
  const [rows] = await getDb().execute<RowDataPacket[]>(
    `SELECT m.id, m.conversation_id AS conversationId, m.sender_id AS senderId, u.name AS senderName,
            m.type, m.content, m.file_name AS fileName, m.file_size AS fileSize, m.file_url AS fileUrl,
            m.recalled, DATE_FORMAT(m.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt
     FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.id = ? LIMIT 1`,
    [id]
  );
  return rows[0];
}

/** 会话列表（含最后一条消息 + 未读数） */
export async function listConversations(userId: number) {
  const [rows] = await getDb().execute<RowDataPacket[]>(
    `SELECT c.id, c.type, c.name, c.group_key AS groupKey,
            (SELECT u.name FROM chat_conversation_members cm2
             JOIN users u ON u.id = cm2.user_id
             WHERE cm2.conversation_id = c.id AND cm2.user_id != ?
             ORDER BY cm2.joined_at LIMIT 1) AS peerName,
            (SELECT m.content FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS lastMessage,
            (SELECT DATE_FORMAT(m.created_at, '%Y-%m-%d %H:%i:%s') FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS lastTime,
            (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01')) AS unread
     FROM chat_conversation_members cm
     JOIN chat_conversations c ON c.id = cm.conversation_id
     WHERE cm.user_id = ?
     ORDER BY COALESCE((SELECT m.created_at FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1), c.created_at) DESC`,
    [userId, userId, userId]
  );
  return rows.map((r) => ({
    ...r,
    name:
      r.type === "group"
        ? r.name
        : (r.peerName || "同事"),
    unread: Number(r.unread || 0),
  }));
}

/** 会话详情：成员列表 + 是否我所在 */
export async function conversationDetail(
  conversationId: string,
  userId: number
): Promise<{
  id: string;
  type: string;
  name: string | null;
  members: { userId: number; name: string }[];
  isMember: boolean;
} | null> {
  const [convos] = await getDb().execute<RowDataPacket[]>(
    "SELECT id, type, name FROM chat_conversations WHERE id = ? LIMIT 1",
    [conversationId]
  );
  if (!convos[0]) return null;
  const [members] = await getDb().execute<MemberRow[]>(
    `SELECT cm.user_id, COALESCE(u.name, CONCAT('用户', cm.user_id)) AS name
     FROM chat_conversation_members cm
     LEFT JOIN users u ON u.id = cm.user_id
     WHERE cm.conversation_id = ?`,
    [conversationId]
  );
  return {
    id: convos[0].id as string,
    type: convos[0].type as string,
    name: (convos[0].name as string) || null,
    members: members.map((m) => ({ userId: m.user_id, name: m.name })),
    isMember: members.some((m) => m.user_id === userId),
  };
}

/** 拉取会话消息（分页，倒序翻页） */
export async function listMessages(conversationId: string, beforeId?: string, limit = 50) {
  let sql = `SELECT m.id, m.conversation_id AS conversationId, m.sender_id AS senderId, u.name AS senderName,
                    m.type, m.content, m.file_name AS fileName, m.file_size AS fileSize, m.file_url AS fileUrl,
                    m.recalled, DATE_FORMAT(m.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt
             FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_id
             WHERE m.conversation_id = ?`;
  const params: (string | number)[] = [conversationId];
  if (beforeId) {
    sql += " AND m.created_at < (SELECT created_at FROM chat_messages WHERE id = ?)";
    params.push(beforeId);
  }
  sql += " ORDER BY m.created_at DESC LIMIT ?";
  params.push(limit);
  const [rows] = await getDb().execute<RowDataPacket[]>(sql, params);
  return rows.reverse();
}

/** 标记已读 */
export async function markConversationRead(conversationId: string, userId: number) {
  await getDb().execute(
    "UPDATE chat_conversation_members SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?",
    [conversationId, userId]
  );
}

/** 撤回/删除：查消息（校验权限） */
export async function getMessageForAction(messageId: string): Promise<{
  id: string;
  conversationId: string;
  senderId: number;
  type: ChatMessageType;
  content: string;
  fileName: string | null;
  fileSize: number | null;
  fileUrl: string | null;
  recalled: boolean;
  createdAt: Date;
} | null> {
  const [rows] = await getDb().execute<RowDataPacket[]>(
    "SELECT id, conversation_id AS conversationId, sender_id AS senderId, type, content, file_name AS fileName, file_size AS fileSize, file_url AS fileUrl, recalled, created_at AS createdAt FROM chat_messages WHERE id = ? LIMIT 1",
    [messageId]
  );
  if (!rows[0]) return null;
  const row = rows[0] as any;
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    type: row.type,
    content: row.content,
    fileName: row.fileName,
    fileSize: row.fileSize,
    fileUrl: row.fileUrl,
    recalled: Boolean(row.recalled),
    createdAt: row.createdAt,
  };
}

/** 物理删除消息 */
export async function deleteMessage(messageId: string): Promise<boolean> {
  const [result] = await getDb().execute<ResultSetHeader>(
    "DELETE FROM chat_messages WHERE id = ?",
    [messageId]
  );
  return result.affectedRows > 0;
}

/** 撤回消息（标记 recalled=1，覆盖内容为"此消息已撤回"） */
export async function recallMessage(messageId: string): Promise<boolean> {
  const [result] = await getDb().execute<ResultSetHeader>(
    "UPDATE chat_messages SET recalled = 1, content = '此消息已撤回' WHERE id = ?",
    [messageId]
  );
  return result.affectedRows > 0;
}

/** 检查消息是否在 5 分钟内（撤回时限） */
export function withinRecallWindow(createdAt: Date): boolean {
  const FIVE_MIN = 5 * 60 * 1000;
  return Date.now() - new Date(createdAt).getTime() <= FIVE_MIN;
}

/** 获取用户部门 */
export { userDept };
