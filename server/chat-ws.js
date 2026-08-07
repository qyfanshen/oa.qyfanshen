/**
 * 即时通讯 WebSocket 服务（独立进程）
 * 端口：CHAT_WS_PORT（默认 3002）
 *
 * 架构：
 *   Next.js REST API (3000) ──HTTP bridge──▶ WS 服务 (3002) ──推送──▶ 浏览器
 *
 * 部署：宝塔 Node 项目管理器加第二个项目（端口 3002），
 *       Nginx 对 /chat-ws 路径做 WebSocket 反代。
 *
 * 启动：node server/chat-ws.js
 */
const { WebSocketServer, WebSocket } = require("ws");
const { SignJWT, jwtVerify } = require("jose");
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
const http = require("http");

// ---------- 读取 .env.local ----------
function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
}
loadEnv();

const PORT = Number(process.env.CHAT_WS_PORT || 3002);
const AUTH_SECRET = process.env.AUTH_SECRET;
const SESSION_COOKIE = "fanshen_oa_session";

// ---------- 数据库连接池 ----------
const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
  connectionLimit: 10,
});

// ---------- Token 鉴权 ----------
function secret() {
  return new TextEncoder().encode(AUTH_SECRET);
}

async function readSession(token) {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || typeof payload.username !== "string") return null;
    if (!["superadmin", "admin", "manager", "employee"].includes(String(payload.role))) return null;
    return { id: Number(payload.sub), username: payload.username, name: payload.name, role: payload.role };
  } catch {
    return null;
  }
}

// ---------- 在线连接管理 ----------
// userId -> Set<ws>
const onlineUsers = new Map();

function addConnection(userId, ws) {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(ws);
}

function removeConnection(userId, ws) {
  const set = onlineUsers.get(userId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) onlineUsers.delete(userId);
  }
}

// ---------- 查询会话成员（推送给哪些人） ----------
async function conversationUserIds(conversationId) {
  const [rows] = await pool.query(
    "SELECT user_id FROM chat_conversation_members WHERE conversation_id = ?",
    [conversationId]
  );
  return rows.map((r) => r.user_id);
}

// ---------- 推送消息给会话所有成员 ----------
async function broadcastToConversation(conversationId, message, exceptUserId = null) {
  const userIds = await conversationUserIds(conversationId);
  const payload = JSON.stringify({ type: "new_message", message });
  for (const uid of userIds) {
    if (uid === exceptUserId) continue;
    const sockets = onlineUsers.get(uid);
    if (sockets) {
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    }
  }
}

// ---------- 推送自定义事件（如 message_deleted / message_recalled） ----------
async function broadcastEvent(conversationId, event) {
  const userIds = await conversationUserIds(conversationId);
  const payload = JSON.stringify(event);
  for (const uid of userIds) {
    const sockets = onlineUsers.get(uid);
    if (sockets) {
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    }
  }
}

// ---------- HTTP 桥接（REST API 发消息后通知 WS） ----------
const bridgeServer = http.createServer(async (req, res) => {
  // 允许同机 REST API 调用
  if (req.method === "POST" && req.url === "/bridge") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      try {
        const data = JSON.parse(raw || "{}");
        if (data.conversationId) {
          // 两种调用方式：
          // 1) { conversationId, message } → 新消息广播
          // 2) { conversationId, event } → 自定义事件（删除/撤回等）
          if (data.message) {
            await broadcastToConversation(data.conversationId, data.message);
          }
          if (data.event) {
            await broadcastEvent(data.conversationId, data.event);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, message: "bad payload" }));
        }
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, message: e.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end("not found");
  }
});

// ---------- WebSocket 服务器 ----------
const wss = new WebSocketServer({ server: bridgeServer, path: "/chat-ws" });

wss.on("connection", (ws, req) => {
  let userId = null;

  // 鉴权：优先 URL ?token=，其次 Cookie
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const token = url.searchParams.get("token") || extractCookie(req.headers.cookie);

  readSession(token).then((session) => {
    if (!session) {
      ws.send(JSON.stringify({ type: "error", message: "未授权" }));
      ws.close(1008, "unauthorized");
      return;
    }
    userId = session.id;
    addConnection(userId, ws);
    ws.send(JSON.stringify({ type: "connected", userId, name: session.name }));

    // 推送未读数
    pool
      .query(
        `SELECT COUNT(*) AS cnt FROM chat_conversation_members cm
         JOIN chat_messages m ON m.conversation_id = cm.conversation_id
         WHERE cm.user_id = ? AND m.sender_id != ? AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01')`,
        [session.id, session.id]
      )
      .then(([rows]) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "unread_count", count: Number(rows[0]?.cnt || 0) }));
        }
      })
      .catch(() => {});
  });

  ws.on("message", async (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      // 客户端 ping
      if (data.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }
    } catch {}
  });

  ws.on("close", () => {
    if (userId) removeConnection(userId, ws);
  });

  ws.on("error", () => {
    if (userId) removeConnection(userId, ws);
  });
});

function extractCookie(header) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return decodeURIComponent(v);
  }
  return null;
}

bridgeServer.listen(PORT, () => {
  console.log(`[chat-ws] WebSocket 服务已启动: ws://0.0.0.0:${PORT}/chat-ws`);
});
