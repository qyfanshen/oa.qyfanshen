/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}
const required = (name) => { if (!process.env[name]) throw new Error(`缺少环境变量：${name}`); return process.env[name]; };

async function ensureColumn(db, table, column, definition) {
  const [columns] = await db.execute(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column]
  );
  if (columns.length === 0) await db.execute(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

const statements = [
  // 部门表（方案 B 新增）
  `CREATE TABLE IF NOT EXISTS departments (
    id VARCHAR(40) PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE, parent_id VARCHAR(40) NULL,
    leader_id VARCHAR(40) NULL, sort_order INT NOT NULL DEFAULT 0, remark VARCHAR(255),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_dept_parent (parent_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS employees (
    id VARCHAR(40) PRIMARY KEY, employee_no VARCHAR(40) NOT NULL UNIQUE, name VARCHAR(100) NOT NULL,
    email VARCHAR(191) NOT NULL UNIQUE, phone VARCHAR(40) NOT NULL, department VARCHAR(100) NOT NULL,
    department_id VARCHAR(40) NULL, position VARCHAR(100) NOT NULL, position_level VARCHAR(30) NOT NULL DEFAULT 'staff',
    manager_id VARCHAR(40) NULL, approval_quota DECIMAL(12,2) NOT NULL DEFAULT 0,
    account_user_id BIGINT UNSIGNED NULL UNIQUE, role ENUM('admin','manager','employee','superadmin') NOT NULL DEFAULT 'employee',
    status ENUM('active','inactive') NOT NULL DEFAULT 'active', join_date DATE NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_emp_dept (department_id), INDEX idx_emp_manager (manager_id), INDEX idx_emp_position_level (position_level)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS leave_requests (
    id VARCHAR(40) PRIMARY KEY, employee_id VARCHAR(40) NOT NULL, leave_type VARCHAR(40) NOT NULL,
    start_date DATE NOT NULL, end_date DATE NOT NULL, days DECIMAL(6,2) NOT NULL, reason TEXT NOT NULL,
    status ENUM('pending','processing','approved','rejected') NOT NULL DEFAULT 'pending', approver_id VARCHAR(40), approved_at DATETIME, comment TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_leave_employee (employee_id), INDEX idx_leave_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS expense_reports (
    id VARCHAR(40) PRIMARY KEY, employee_id VARCHAR(40) NOT NULL, expense_type VARCHAR(40) NOT NULL,
    amount DECIMAL(12,2) NOT NULL, expense_date DATE NOT NULL, description TEXT NOT NULL,
    status ENUM('pending','processing','approved','rejected') NOT NULL DEFAULT 'pending', attachments JSON,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_expense_employee (employee_id), INDEX idx_expense_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS seal_requests (
    id VARCHAR(40) PRIMARY KEY, employee_id VARCHAR(40) NOT NULL, seal_type VARCHAR(40) NOT NULL,
    document_name VARCHAR(255) NOT NULL, copies INT NOT NULL DEFAULT 1, purpose TEXT NOT NULL,
    urgency ENUM('normal','urgent') NOT NULL DEFAULT 'normal',
    status ENUM('pending','processing','approved','rejected') NOT NULL DEFAULT 'pending', approver_id VARCHAR(40), approved_at DATETIME, comment TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_seal_employee (employee_id), INDEX idx_seal_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS approval_requests (
    id VARCHAR(40) PRIMARY KEY, flow_id VARCHAR(40) NOT NULL, applicant_id VARCHAR(40) NOT NULL,
    title VARCHAR(255) NOT NULL, content TEXT NOT NULL, approval_type VARCHAR(40) NOT NULL, amount DECIMAL(12,2),
    status ENUM('pending','processing','approved','rejected') NOT NULL DEFAULT 'pending', current_step INT NOT NULL DEFAULT 0,
    steps JSON NOT NULL, attachments JSON, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_approval_status (status), INDEX idx_approval_applicant (applicant_id), INDEX idx_approval_type (approval_type)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  // 审批流程模板表（方案 B：为可视化流程设计器预留）
  `CREATE TABLE IF NOT EXISTS approval_flow_templates (
    id VARCHAR(40) PRIMARY KEY, name VARCHAR(100) NOT NULL, approval_type VARCHAR(40) NOT NULL,
    min_amount DECIMAL(12,2) NOT NULL DEFAULT 0, max_amount DECIMAL(12,2) NOT NULL DEFAULT 99999999,
    min_days INT NOT NULL DEFAULT 0, max_days INT NOT NULL DEFAULT 999,
    steps JSON NOT NULL, enabled TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_flow_type (approval_type, enabled)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS attendance_records (
    id VARCHAR(40) PRIMARY KEY, employee_id VARCHAR(40) NOT NULL, work_date DATE NOT NULL,
    clock_in TIME, clock_out TIME, status VARCHAR(20) NOT NULL DEFAULT 'normal', work_type VARCHAR(20) NOT NULL DEFAULT 'office',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_attendance_employee_date (employee_id, work_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS announcements (
    id VARCHAR(40) PRIMARY KEY, title VARCHAR(255) NOT NULL, content TEXT NOT NULL, announcement_type VARCHAR(30) NOT NULL,
    author_id VARCHAR(40) NOT NULL, is_pinned TINYINT(1) NOT NULL DEFAULT 0, view_count INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_announcement_pinned (is_pinned, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS partners (
    id VARCHAR(40) PRIMARY KEY, name VARCHAR(191) NOT NULL, partner_type VARCHAR(30) NOT NULL, contact_person VARCHAR(100) NOT NULL,
    contact_phone VARCHAR(40) NOT NULL, contact_email VARCHAR(191), address VARCHAR(255), cooperation TEXT, status VARCHAR(20) NOT NULL DEFAULT 'potential',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(40) PRIMARY KEY, name VARCHAR(191) NOT NULL, partner_id VARCHAR(40), partner_name VARCHAR(191) NOT NULL,
    project_type VARCHAR(40) NOT NULL, status VARCHAR(30) NOT NULL, priority VARCHAR(20) NOT NULL, leader_id VARCHAR(40) NOT NULL,
    members JSON, start_date DATE, end_date DATE, budget DECIMAL(12,2) NOT NULL DEFAULT 0, description TEXT, progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_project_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(40) PRIMARY KEY, name VARCHAR(255) NOT NULL, document_type VARCHAR(30) NOT NULL, category VARCHAR(100) NOT NULL,
    file_size VARCHAR(40), uploader_id VARCHAR(40) NOT NULL, storage_key VARCHAR(500), version INT NOT NULL DEFAULT 1,
    download_count INT NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS meetings (
    id VARCHAR(40) PRIMARY KEY, title VARCHAR(255) NOT NULL, room VARCHAR(100) NOT NULL, organizer_id VARCHAR(40) NOT NULL,
    attendees JSON NOT NULL, start_time DATETIME NOT NULL, end_time DATETIME NOT NULL, description TEXT, status VARCHAR(20) NOT NULL DEFAULT 'scheduled', minutes TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_meeting_status_time (status, start_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

async function main() {
  const db = await mysql.createConnection({ host: required("DB_HOST"), port: Number(process.env.DB_PORT || 3306), user: required("DB_USER"), password: required("DB_PASSWORD"), database: required("DB_NAME"), charset: "utf8mb4" });
  try {
    for (const statement of statements) await db.execute(statement);

    // 为已存在的表补齐 processing 状态（增量迁移）
    const alterStatusEnums = [
      "ALTER TABLE leave_requests MODIFY COLUMN status ENUM('pending','processing','approved','rejected') NOT NULL DEFAULT 'pending'",
      "ALTER TABLE expense_reports MODIFY COLUMN status ENUM('pending','processing','approved','rejected') NOT NULL DEFAULT 'pending'",
      "ALTER TABLE seal_requests MODIFY COLUMN status ENUM('pending','processing','approved','rejected') NOT NULL DEFAULT 'pending'",
    ];
    for (const sql of alterStatusEnums) {
      try { await db.execute(sql); } catch (_) { /* 已包含 processing 则忽略 */ }
    }

    const [accountColumn] = await db.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'account_user_id'");
    if (accountColumn.length === 0) await db.execute("ALTER TABLE employees ADD COLUMN account_user_id BIGINT UNSIGNED NULL UNIQUE AFTER position");
    // 方案 B：补齐 employees 新增字段（幂等）
    await ensureColumn(db, "employees", "department_id", "department_id VARCHAR(40) NULL AFTER department");
    await ensureColumn(db, "employees", "position_level", "position_level VARCHAR(30) NOT NULL DEFAULT 'staff' AFTER position");
    await ensureColumn(db, "employees", "manager_id", "manager_id VARCHAR(40) NULL AFTER position_level");
    await ensureColumn(db, "employees", "approval_quota", "approval_quota DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER manager_id");
    await ensureColumn(db, "employees", "role", "role ENUM('admin','manager','employee','superadmin') NOT NULL DEFAULT 'employee'");
    // role 字段需要支持 superadmin
    try {
      const [roleCol] = await db.execute("SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'role'");
      if (roleCol[0] && !String(roleCol[0].COLUMN_TYPE).includes("superadmin")) {
        await db.execute("ALTER TABLE employees MODIFY COLUMN role ENUM('admin','manager','employee','superadmin') NOT NULL DEFAULT 'employee'");
      }
    } catch (e) { /* ignore */ }
    await ensureColumn(db, "expense_reports", "attachments", "attachments JSON AFTER status");
    await ensureColumn(db, "approval_requests", "attachments", "attachments JSON AFTER steps");
    // 考勤打卡位置（经纬度），范围校验用
    await ensureColumn(db, "attendance_records", "location_lat", "location_lat DECIMAL(10,6) NULL AFTER work_type");
    await ensureColumn(db, "attendance_records", "location_lng", "location_lng DECIMAL(10,6) NULL AFTER location_lat");
    // 文档可见性（公开/指定人员），员工上传文档可指定查看人
    await ensureColumn(db, "documents", "visibility", "visibility ENUM('all','private') NOT NULL DEFAULT 'all'");
    // 文档可见人员映射（私有文档指定员工可查看）
    await db.execute(`CREATE TABLE IF NOT EXISTS document_viewers (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      document_id VARCHAR(40) NOT NULL,
      employee_id VARCHAR(40) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_doc_viewer (document_id, employee_id),
      INDEX idx_doc_viewer_doc (document_id),
      INDEX idx_doc_viewer_emp (employee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);

    // 通知表（收件人=users.id）
    await db.execute(`CREATE TABLE IF NOT EXISTS notifications (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      recipient_id INT NOT NULL,
      type VARCHAR(32) NOT NULL,
      title VARCHAR(255) NOT NULL,
      content TEXT NULL,
      related_url VARCHAR(500) NULL,
      related_id VARCHAR(64) NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      read_at DATETIME NULL,
      INDEX idx_recipient_unread (recipient_id, is_read, created_at),
      INDEX idx_recipient_time (recipient_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);

    // 初始化默认部门数据（幂等）
    const defaultDepts = [
      { id: "dept-mgmt", name: "管理层", sort: 1 },
      { id: "dept-finance", name: "财务部", sort: 2 },
      { id: "dept-hr", name: "人事部", sort: 3 },
      { id: "dept-tech", name: "技术部", sort: 4 },
      { id: "dept-biz", name: "商务部", sort: 5 },
      { id: "dept-admin", name: "行政部", sort: 6 },
    ];
    for (const d of defaultDepts) {
      await db.execute("INSERT INTO departments (id, name, sort_order) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order)", [d.id, d.name, d.sort]);
    }

    // 初始化默认审批流程模板（幂等）
    const flowTemplates = [
      {
        id: "ft-exp-small", name: "小额报销（≤500）", type: "expense", min: 0, max: 500, minDays: 0, maxDays: 999,
        steps: [{ order: 0, role: "manager", name: "部门经理" }, { order: 1, role: "finance", name: "财务" }],
      },
      {
        id: "ft-exp-mid", name: "中额报销（500-3000）", type: "expense", min: 500, max: 3000, minDays: 0, maxDays: 999,
        steps: [{ order: 0, role: "manager", name: "部门经理" }, { order: 1, role: "director", name: "财务总监" }, { order: 2, role: "finance", name: "财务" }],
      },
      {
        id: "ft-exp-large", name: "大额报销（3000-10000）", type: "expense", min: 3000, max: 10000, minDays: 0, maxDays: 999,
        steps: [{ order: 0, role: "manager", name: "部门经理" }, { order: 1, role: "director", name: "财务总监" }, { order: 2, role: "finance", name: "财务" }, { order: 3, role: "ceo", name: "总经理" }],
      },
      {
        id: "ft-exp-huge", name: "巨额报销（>10000）", type: "expense", min: 10000, max: 99999999, minDays: 0, maxDays: 999,
        steps: [{ order: 0, role: "manager", name: "部门经理" }, { order: 1, role: "director", name: "财务总监" }, { order: 2, role: "finance", name: "财务" }, { order: 3, role: "ceo", name: "总经理" }, { order: 4, role: "board", name: "董事会备案" }],
      },
    ];
    for (const ft of flowTemplates) {
      await db.execute(
        "INSERT INTO approval_flow_templates (id, name, approval_type, min_amount, max_amount, min_days, max_days, steps, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1) ON DUPLICATE KEY UPDATE name = VALUES(name), steps = VALUES(steps), enabled = 1",
        [ft.id, ft.name, ft.type, ft.min, ft.max, ft.minDays, ft.maxDays, JSON.stringify(ft.steps)]
      );
    }

    const [testAccounts] = await db.execute("SELECT id FROM users WHERE username = ? LIMIT 1", [process.env.TEST_EMPLOYEE_USERNAME || "test_employee"]);
    if (testAccounts[0]) await db.execute("INSERT INTO employees (id, employee_no, name, email, phone, department, department_id, position, position_level, account_user_id, role, status, join_date) SELECT 'emp-test', 'FS_TEST', '测试员工', 'test_employee@fanshen.local', '13800000000', '测试部', 'dept-tech', '测试员工', 'staff', ?, 'employee', 'active', CURDATE() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM employees WHERE account_user_id = ?)", [testAccounts[0].id, testAccounts[0].id]);

    // ========== 即时通讯（聊天）表 ==========
    // 会话表：type=private 私聊 | group 群聊（部门群）
    await db.execute(`CREATE TABLE IF NOT EXISTS chat_conversations (
      id VARCHAR(40) NOT NULL PRIMARY KEY,
      type ENUM('private','group') NOT NULL DEFAULT 'private',
      name VARCHAR(255) NULL,
      group_key VARCHAR(100) NULL,
      created_by INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_chat_group_key (group_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);

    // 会话成员（用户维度，last_read_at 用于未读数）
    await db.execute(`CREATE TABLE IF NOT EXISTS chat_conversation_members (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      conversation_id VARCHAR(40) NOT NULL,
      user_id INT NOT NULL,
      joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_read_at DATETIME NULL,
      UNIQUE KEY uq_chat_member (conversation_id, user_id),
      INDEX idx_chat_member_user (user_id, conversation_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);

    // 消息表：type=text | image | file | system
    await db.execute(`CREATE TABLE IF NOT EXISTS chat_messages (
      id VARCHAR(40) NOT NULL PRIMARY KEY,
      conversation_id VARCHAR(40) NOT NULL,
      sender_id INT NOT NULL,
      type ENUM('text','image','file','system') NOT NULL DEFAULT 'text',
      content TEXT NOT NULL,
      file_name VARCHAR(255) NULL,
      file_size BIGINT NULL,
      file_url VARCHAR(500) NULL,
      recalled TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_chat_msg_convo (conversation_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);

    // 兼容旧表（已存在但无 recalled 字段）
    try { await db.execute("ALTER TABLE chat_messages ADD COLUMN recalled TINYINT(1) NOT NULL DEFAULT 0"); } catch {}

    console.log("业务数据库表已创建完成。");
  } finally {
    await db.end();
  }
}
main().catch((error) => { console.error(`初始化失败：${error.message}`); process.exitCode = 1; });
