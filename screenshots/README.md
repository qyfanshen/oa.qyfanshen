# Screenshots

> 本目录用于存放项目视觉素材。所有截图均通过本地服务 + Edge 无头浏览器渲染生成。

## 截图清单

### `preview.png`

![首页预览](preview.png)

> 首页预览

### `wechat-qrcode.png`

![wechat-qrcode.png](wechat-qrcode.png)

> wechat-qrcode.png

## 如何重新生成截图

1. 在本地启动项目：
   ```bash
   # 静态站
   python -m http.server 8080

   # PHP 站
   php -S 127.0.0.1:8080 -t .

   # Next.js 站
   pnpm install && pnpm dev
   ```
2. 用无头浏览器截图：
   ```bash
   "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
     --headless=new --disable-gpu --no-first-run \
     --user-data-dir=C:/Temp/edge-shot \
     --window-size=1280,800 \
     --screenshot="screenshots/preview.png" \
     --virtual-time-budget=10000 \
     "http://127.0.0.1:8080/"
   ```

## 命名建议

- `preview.png` — 主页预览（桌面）
- `flow-*.png` — 业务流程/管理台（大视口）
- `mobile-*.png` — 移动端响应式（390×844）
- `admin-*.png` / `portal-*.png` — 后台或门户页面
- `page-*.png` — 独立静态页（如隐私政策）
