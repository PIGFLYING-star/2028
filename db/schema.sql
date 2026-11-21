-- 臻辉班 · 班级纪念册 D1 数据结构
--
-- 用法（任选其一）：
--   1. Cloudflare 面板 → D1 → 选库 → Console，整段粘贴执行
--   2. 命令行：npx wrangler d1 execute <数据库名> --remote --file=db/schema.sql
--
-- 说明：两个 Functions 里还留了一份 ensureSchema 兜底（每个 worker 实例只执行一次），
--      正式环境以本文件为准，改表结构时两边一起改。

-- ---------------------------------------------------------------------------
-- 留言墙
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  content   TEXT    NOT NULL,
  client_id TEXT,                                -- 发布者标识，同时作为删除口令，绝不对外返回
  create_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP   -- UTC，"YYYY-MM-DD HH:MM:SS"
);

-- 首页每 8 秒轮询一次，倒序取最新 300 条
CREATE INDEX IF NOT EXISTS idx_messages_created
  ON messages (create_at DESC);

-- ---------------------------------------------------------------------------
-- 照片评论（每张照片的"背面"）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS photo_comments (
  id            TEXT    PRIMARY KEY,             -- UUID
  gallery_group TEXT    NOT NULL,                -- class-photo / classroom / campus / training / group-activity
  photo_index   INTEGER NOT NULL,                -- 该相册里的第几张，从 0 开始
  content       TEXT    NOT NULL,
  client_id     TEXT    NOT NULL,
  create_at     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_photo_comments_lookup
  ON photo_comments (gallery_group, photo_index, create_at);
