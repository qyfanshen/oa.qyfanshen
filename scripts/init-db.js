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
    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending', approver_id VARCHAR(40), approved_at DATETIME, comment TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_leave_employee (employee_id), INDEX idx_leave_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS expense_reports (
    id VARCHAR(40) PRIMARY KEY, employee_id VARCHAR(40) NOT NULL, expense_type VARCHAR(40) NOT NULL,
    amount DECIMAL(12,2) NOT NULL, expense_date DATE NOT NULL, description TEXT NOT NULL,
    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending', attachments JSON,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_expense_employee (employee_id), INDEX idx_expense_status (status)
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
  for (const statement of statements) await db.execute(statement);
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
    // 方案 2：按类型 + 天数拆分（优先级从高到低匹配）
    // 事假 / 年假 / 其他：1-3天主管，3-7天主管+经理，>7天主管+经理+HRD
    {
      id: "ft-leave-default-short", name: "事假/年假/其他（≤3天）", type: "leave", min: 0, max: 99999999, minDays: 0, maxDays: 3,
      steps: [{ order: 0, role: "manager", name: "直属主管" }],
    },
    {
      id: "ft-leave-default-mid", name: "事假/年假/其他（3-7天）", type: "leave", min: 0, max: 99999999, minDays: 3, maxDays: 7,
      steps: [{ order: 0, role: "manager", name: "直属主管" }, { order: 1, role: "director", name: "部门经理" }],
    },
    {
      id: "ft-leave-default-long", name: "事假/年假/其他（>7天）", type: "leave", min: 0, max: 99999999, minDays: 7, maxDays: 999,
      steps: [{ order: 0, role: "manager", name: "直属主管" }, { order: 1, role: "director", name: "部门经理" }, { order: 2, role: "hrd", name: "人事总监" }],
    },
    // 病假：1-7天都只走主管，避免小病打扰领导；>7天走 HRD
    {
      id: "ft-leave-sick-short", name: "病假（≤7天）", type: "leave", min: 0, max: 99999999, minDays: 0, maxDays: 7,
      steps: [{ order: 0, role: "manager", name: "直属主管" }],
    },
    {
      id: "ft-leave-sick-long", name: "病假（>7天）", type: "leave", min: 0, max: 99999999, minDays: 7, maxDays: 999,
      steps: [{ order: 0, role: "manager", name: "直属主管" }, { order: 1, role: "hrd", name: "人事总监（需医院证明）" }],
    },
    // 婚假：1-7天走主管，>7天走主管+HRD（法定一般 1-10 天）
    {
      id: "ft-leave-marriage-short", name: "婚假（≤7天）", type: "leave", min: 0, max: 99999999, minDays: 0, maxDays: 7,
      steps: [{ order: 0, role: "manager", name: "直属主管" }],
    },
    {
      id: "ft-leave-marriage-long", name: "婚假（>7天）", type: "leave", min: 0, max: 99999999, minDays: 7, maxDays: 999,
      steps: [{ order: 0, role: "manager", name: "直属主管" }, { order: 1, role: "hrd", name: "人事总监" }],
    },
    // 丧假：1-7天走主管，>7天走主管+HRD
    {
      id: "ft-leave-bereavement-short", name: "丧假（≤7天）", type: "leave", min: 0, max: 99999999, minDays: 0, maxDays: 7,
      steps: [{ order: 0, role: "manager", name: "直属主管" }],
    },
    {
      id: "ft-leave-bereavement-long", name: "丧假（>7天）", type: "leave", min: 0, max: 99999999, minDays: 7, maxDays: 999,
      steps: [{ order: 0, role: "manager", name: "直属主管" }, { order: 1, role: "hrd", name: "人事总监" }],
    },
    // 产假：超过 7 天全链路（法定 98 天+，需 CEO 备案）
    {
      id: "ft-leave-maternity-short", name: "产假（≤7天）", type: "leave", min: 0, max: 99999999, minDays: 0, maxDays: 7,
      steps: [{ order: 0, role: "manager", name: "直属主管" }],
    },
    {
      id: "ft-leave-maternity-long", name: "产假（>7天，法定长假）", type: "leave", min: 0, max: 99999999, minDays: 7, maxDays: 999,
      steps: [{ order: 0, role: "manager", name: "直属主管" }, { order: 1, role: "director", name: "部门经理" }, { order: 2, role: "hrd", name: "人事总监" }, { order: 3, role: "ceo", name: "总经理" }],
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
  await db.end();
  console.log("业务数据库表已创建完成。");
}
main().catch((error) => { console.error(`初始化失败：${error.message}`); process.exitCode = 1; });
