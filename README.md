# OA系统

oa.qyfanshen.com

## 部署要求
- PHP >= 8.0 / Node.js >= 18
- MySQL 5.7+ 或 SQLite
- Nginx / Apache

## 安装
```bash
git clone https://github.com/qyfanshen/oa.qyfanshen.git
cp .env.example .env    # 编辑 .env 填入真实配置
# npm install           # 如有 Node 依赖
# composer install      # 如有 PHP 依赖
```

## 安全须知
- 切勿提交 .env、数据库文件、密钥
- 开启 HTTPS
- 安装后删除 install.php

## 许可证
[MIT](LICENSE)
