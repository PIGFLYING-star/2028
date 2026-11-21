/**
 * Cloudflare Pages Functions · 留言接口
 *
 *   GET    /api/messages   读取留言（倒序，最多 300 条）
 *   POST   /api/messages   发布留言
 *   DELETE /api/messages   删除自己发布的留言
 *
 * 归属校验约定：
 *   - 前端在请求头 X-Client-Id 里携带本机标识
 *   - 服务端只用它做比对，**绝不会把它写进任何响应**
 *   - 响应里的 mine 表示「这条是不是你发的」
 *   - 响应里的 author 是 client_id 的短哈希，仅用于前端去重，无法反推出 client_id
 *   - DELETE 需要 id + client_id，client_id 相当于删除口令
 */

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=UTF-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Vary': 'X-Client-Id'
};

const MAX_CONTENT = 200;
const MAX_LIST = 300;
const COOLDOWN_MS = 5000;
const HOURLY_LIMIT = 30;
const CLIENT_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;


function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}


/** 去掉控制字符、按码点截断（避免把 emoji 劈成两半） */
function clip(value, max) {
  const text = String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  if (!text) return '';
  return Array.from(text).slice(0, max).join('');
}


function clientIdOf(request) {
  const raw = request.headers.get('X-Client-Id') || '';
  return CLIENT_ID_RE.test(raw) ? raw : '';
}


/**
 * 取客户端标识：优先请求头；为兼容旧版页面（只放在 body 里）再兜底读 body
 */
function resolveClientId(request, body) {
  const fromHeader = clientIdOf(request);
  if (fromHeader) return fromHeader;
  const raw = String((body && body.client_id) || '');
  return CLIENT_ID_RE.test(raw) ? raw : '';
}


/** FNV-1a 32bit，只用来给前端做去重键 */
function fingerprint(value) {
  const text = String(value || '');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}


/** SQLite CURRENT_TIMESTAMP 是 UTC 且不带时区，补成标准 ISO */
function utcToIso(value) {
  const text = String(value || '');
  if (!text) return '';
  if (/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(text)) return text;
  return text.replace(' ', 'T') + 'Z';
}


/**
 * 建表：每个 worker 实例只跑一次，不再每个请求都执行 DDL。
 * 正式部署请以 db/schema.sql 为准，这里只是兜底。
 */
let schemaReady = null;

function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content TEXT NOT NULL,
          client_id TEXT,
          create_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      await db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_messages_created
        ON messages (create_at DESC)
      `).run();

      // 兼容非常旧的数据库（没有 client_id 列）
      try {
        await db.prepare(`ALTER TABLE messages ADD COLUMN client_id TEXT`).run();
      } catch (error) {
        // 列已存在，忽略
      }
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}


export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: { 'Allow': 'GET, POST, DELETE, OPTIONS' }
  });
}


export async function onRequestGet({ request, env }) {
  if (!env.DB) {
    return json({ error: 'D1 binding DB is not configured.' }, 500);
  }

  try {
    await ensureSchema(env.DB);

    const me = clientIdOf(request);

    const { results = [] } = await env.DB.prepare(`
      SELECT id, content, client_id, create_at
      FROM messages
      ORDER BY id DESC
      LIMIT ?
    `).bind(MAX_LIST).all();

    return json(results.map((row) => ({
      id: row.id,
      content: row.content,
      create_at: utcToIso(row.create_at),
      author: fingerprint(row.client_id),
      mine: Boolean(me) && row.client_id === me
    })));
  } catch (error) {
    console.error('messages GET failed:', error);
    return json({ error: '加载留言失败，请稍后再试' }, 500);
  }
}


export async function onRequestPost({ request, env }) {
  if (!env.DB) {
    return json({ error: 'D1 binding DB is not configured.' }, 500);
  }

  let body = null;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: '请求格式错误' }, 400);
  }

  const clientId = resolveClientId(request, body);
  if (!clientId) {
    return json({ error: '客户端标识无效，请刷新页面后重试' }, 400);
  }

  const content = clip(body && body.content, MAX_CONTENT);
  if (!content) {
    return json({ error: '留言内容不能为空' }, 400);
  }

  try {
    await ensureSchema(env.DB);

    // 冷却：同一客户端两次发送至少间隔 COOLDOWN_MS
    const { results: recent = [] } = await env.DB.prepare(`
      SELECT create_at FROM messages
      WHERE client_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).bind(clientId).all();

    if (recent.length) {
      const last = Date.parse(utcToIso(recent[0].create_at));
      if (Number.isFinite(last) && Date.now() - last < COOLDOWN_MS) {
        return json({ error: '发送太快了，请稍等几秒再试' }, 429);
      }
    }

    // 每小时上限，挡住脚本刷屏
    const { results: hourly = [] } = await env.DB.prepare(`
      SELECT COUNT(*) AS total FROM messages
      WHERE client_id = ? AND create_at >= datetime('now', '-1 hour')
    `).bind(clientId).all();

    if ((hourly[0] && hourly[0].total) >= HOURLY_LIMIT) {
      return json({ error: '这一小时说得太多啦，休息一下再来' }, 429);
    }

    const info = await env.DB.prepare(`
      INSERT INTO messages (content, client_id)
      VALUES (?, ?)
    `).bind(content, clientId).run();

    const id = info && info.meta ? info.meta.last_row_id : null;

    return json({
      success: true,
      id,
      message: '发布成功',
      item: {
        id,
        content,
        create_at: new Date().toISOString(),
        author: fingerprint(clientId),
        mine: true
      }
    }, 201);
  } catch (error) {
    console.error('messages POST failed:', error);
    return json({ error: '发布失败，请稍后再试' }, 500);
  }
}


export async function onRequestDelete({ request, env }) {
  if (!env.DB) {
    return json({ error: 'D1 binding DB is not configured.' }, 500);
  }

  let body = null;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: '请求格式错误' }, 400);
  }

  const id = Number(body && body.id);
  const clientId = CLIENT_ID_RE.test(String((body && body.client_id) || ''))
    ? String(body.client_id)
    : '';

  if (!Number.isInteger(id) || id <= 0 || !clientId) {
    return json({ error: '参数错误' }, 400);
  }

  try {
    await ensureSchema(env.DB);

    const result = await env.DB.prepare(`
      DELETE FROM messages
      WHERE id = ? AND client_id = ?
    `).bind(id, clientId).run();

    const changes = result && result.meta ? result.meta.changes : 0;
    if (!changes) {
      return json({ error: '这条留言不存在，或者不是本机发布的' }, 404);
    }

    return json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('messages DELETE failed:', error);
    return json({ error: '删除失败，请稍后再试' }, 500);
  }
}
