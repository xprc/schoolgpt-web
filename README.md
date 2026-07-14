# schoolgpt-web

校园百事通：前端

## 本地编译

首次安装依赖：

```bash
npm ci
```

编译生产版本：

```bash
npm run build
```

构建产物会输出到 `dist/` 目录。前端默认请求同源的 `/api`，如果部署时后端 API 不在同源 `/api` 下，可以在构建前设置 `VITE_SCHOOLGPT_API_BASE_URL`。

Linux/macOS：

```bash
VITE_SCHOOLGPT_API_BASE_URL=https://schoolgpt.example.com/api npm run build
```

Windows PowerShell：

```powershell
$env:VITE_SCHOOLGPT_API_BASE_URL='https://schoolgpt.example.com/api'; npm run build
```

## Nginx 部署示例

将 `dist/` 目录中的文件部署到 Nginx 静态目录，例如 `/var/www/schoolgpt-web/dist`，并参考以下配置：

```nginx
server {
    listen 80;
    server_name schoolgpt.example.com;

    root /var/www/schoolgpt-web/dist;
    index index.html;

    include /etc/nginx/mime.types;
    types {
        application/javascript mjs;
    }

    location / {
        try_files $uri $uri/ /index.html?$args;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 关键配置说明

- `location /` 中的 `try_files $uri $uri/ /index.html?$args;` 用于支持 React/Vite 单页应用的前端路由。Nginx 会先尝试返回真实存在的静态文件或目录；如果访问的是 `/settings`、`/admin` 等由前端路由接管的地址，则回退到 `index.html`。末尾的 `?$args` 会保留原始查询参数，避免 `/settings?tab=profile` 这类地址在回退后丢失参数。
- `.mjs` 是 ES Module 常见扩展名，浏览器要求它以 JavaScript MIME type 返回。如果 Nginx 没有为 `.mjs` 配置 MIME type，可能会把文件作为 `application/octet-stream` 或 `text/plain` 返回，导致浏览器报错拒绝加载模块脚本。通常应通过 `include /etc/nginx/mime.types;` 加载默认类型，并像示例中一样显式补充 `application/javascript mjs;`；如果直接维护 `mime.types` 文件，也可以写成 `application/javascript js mjs;`。若看到 `.mjd`，请先确认是否为 `.mjs` 扩展名误写；Nginx MIME type 配置必须匹配真实文件扩展名。
