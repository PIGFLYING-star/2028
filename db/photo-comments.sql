-- 臻辉班 · 相册照片评论
-- 该表存放“照片背面”的公开评论。

CREATE TABLE IF NOT EXISTS photo_comments (
  id TEXT PRIMARY KEY,
  gallery_group TEXT NOT NULL,
  photo_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  client_id TEXT NOT NULL,
  create_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_photo_comments_lookup
ON photo_comments (
  gallery_group,
  photo_index,
  create_at
);