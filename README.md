# 臻辉班 · 班级纪念册（2028）

单页静态站点 + Cloudflare Pages Functions + D1。班级照片、弹幕留言、照片评论、背景音乐都在这一页里。

```
.
├── index.html              页面本体（结构 / 样式 / 脚本内联，单文件）
├── 404.html                自定义 404
├── favicon.ico             站点图标（多尺寸）
├── _headers                Cloudflare Pages 响应头（缓存 + 安全头）
├── assets/
│   ├── fonts/              NotoSerifSC.woff2、MaShanZheng.woff2（子集化字体）
│   ├── img/                班级照片、班徽、favicon 与分享图
│   └── music/              背景音乐与封面
├── media/                  歌词 *.lrc
├── functions/api/          Pages Functions
│   ├── messages.js         留言墙接口
│   └── photo-comments.js   照片评论接口
├── db/schema.sql           D1 建表脚本
└── tools/make-fonts.py     字体子集化脚本（改了页面文案后重跑）
```

## 部署

### 1. 建 D1 数据库

```bash
npx wrangler d1 create zhenhui
```

把返回的 `database_id` 记下来，然后执行建表脚本（面板 Console 粘贴执行也可以）：

```bash
npx wrangler d1 execute zhenhui --remote --file=db/schema.sql
```

### 2. 建 Pages 项目并绑定 D1

**函数只能靠 Git 集成或 Wrangler 部署。** 在面板里拖文件夹 / 传 zip（Direct Upload）**不会编译 `functions/` 目录**，只会上静态页面，留言和照片评论接口 404。

**方式 A：Git 集成（当前项目用的就是这个）**

推送到 GitHub，Cloudflare 自动构建。项目设置里：

| 设置 | 值 |
|---|---|
| Build command | 留空 |
| Build output directory | `/`（`index.html` 所在目录） |

`functions/` 必须和 `index.html` 并排放在仓库根目录，**不能塞进 `dist/` 之类的构建输出目录**，否则不会被编译。

**方式 B：Wrangler**

```bash
cd 2028-main                 # 必须在含 functions/ 的这一层执行
npx wrangler login
npx wrangler pages deploy .
```

`functions/` 是按"命令执行目录"查找的，所以一定要 `cd` 进来再 `deploy .`；在上一层执行 `deploy 2028-main` 会漏掉接口。

然后在 **Settings → Functions → D1 database bindings** 添加绑定：

| 项目 | 值 |
|---|---|
| Variable name | `DB`（必须是 `DB`，两个接口都读 `env.DB`） |
| D1 database | 刚才创建的 `zhenhui` |

绑定是项目级的，之后重新部署不会丢；只有新建项目时要重新加。绑定改完需要重新部署一次才生效。

### 3. 本地预览

```bash
npx wrangler pages dev . --d1=DB=<database_id>
```

`index.html` 必须放在站点根目录，`functions/` 也必须叫这个名字，否则接口不会生效，留言墙会显示"留言暂时连不上"。

## 接口约定

两个接口都靠请求头 `X-Client-Id` 识别"是不是本机发的"：

- `client_id` 存在浏览器 localStorage，**只在服务端参与比对，任何响应里都不会返回**
- 响应里的 `mine` 表示这条是否属于当前浏览器
- 响应里的 `author` 是 client_id 的短哈希，仅用于前端去重
- 删除必须同时提供 `id` 和 `client_id`（相当于删除口令），删不到行会返回 404

| 接口 | 方法 | 说明 |
|---|---|---|
| `/api/messages` | GET | 最新 300 条，倒序 |
| `/api/messages` | POST | 发布留言，5 秒冷却，每客户端每小时 30 条 |
| `/api/messages` | DELETE | 删除自己的留言 |
| `/api/photo-comments?gallery=&photo=` | GET | 某张照片的评论，最多 50 条 |
| `/api/photo-comments` | POST | 发布评论，5 秒冷却 |
| `/api/photo-comments` | DELETE | 删除自己的评论 |

## 改内容时的注意事项

**改文案后字体可能缺字。** 正文字体是 Noto Serif SC 的 GB2312 子集（覆盖 6763 个常用汉字），手写体只包含当前页面用到的字。如果新增了生僻字：

1. 下载 [Noto Serif SC](https://fonts.google.com/noto/specimen/Noto+Serif+SC) 与 [Ma Shan Zheng](https://fonts.google.com/specimen/Ma+Shan+Zheng) 的 TTF
2. `pip install fonttools brotli`
3. `python tools/make-fonts.py --noto NotoSerifSC-VF.ttf --mashan MaShanZheng-Regular.ttf`
4. 把 `index.html` 里 `@font-face` 的 `?v=1` 改成 `?v=2`，避免老访客拿到旧缓存

**换图片时**，如果文件名不变，最多要等 1 天缓存过期（见 `_headers`）；想立刻生效就改名或加 `?v=N`。

**歌词文件**统一用英文名：`media/zhenhui.lrc`、`media/zaijian.lrc`、`media/memory.lrc`。

## 已验证的行为

- 留言发出后，"我的留言"立即出现，且不会重复
- 删除留言失败时会把条目放回列表并提示，不会假装删掉
- 留言内包含 `& < >` 等字符时原样显示
- 时间统一按北京时间显示（服务端存 UTC，前端按本地时区格式化）
- 深色/浅色无关；`prefers-reduced-motion` 下动画全部关闭
