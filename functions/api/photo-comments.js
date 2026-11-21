/**
 * Cloudflare Pages Functions · 相册照片评论接口
 *
 *   GET    /api/photo-comments?gallery=<组>&photo=<序号>   读取某张照片的评论
 *   POST   /api/photo-comments                            发布评论
 *   DELETE /api/photo-comments                            删除自己的评论
 *
 * 归属校验约定同 /api/messages：
 *   - 前端用请求头 X-Client-Id 表明身份
 *   - client_id 只在服务端比对，绝不下发
 *   - 响应里的 mine 表示「这条是不是你发的」
 */

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=UTF-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Vary': 'X-Client-Id'
};

const MAX_CONTENT = 200;
const MAX_LIST = 50;
const COOLDOWN_MS = 5000;
const CLIENT_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;


function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}


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


function validPhotoIndex(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 999;
}


/** SQLite / ISO 时间统一补成带时区的 ISO */
function utcToIso(value) {
  const text = String(value || '');
  if (!text) return '';
  if (/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(text)) return text;
  return text.replace(' ', 'T') + 'Z';
}


/** 建表只在每个 worker 实例里跑一次 */
let schemaReady = null;

function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS photo_comments (
          id TEXT PRIMARY KEY,
          gallery_group TEXT NOT NULL,
          photo_index INTEGER NOT NULL,
          content TEXT NOT NULL,
          client_id TEXT NOT NULL,
          create_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      await db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_photo_comments_lookup
        ON photo_comments (gallery_group, photo_index, create_at)
      `).run();
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}


function shape(row, me) {
  return {
    id: row.id,
    gallery_group: row.gallery_group,
    photo_index: row.photo_index,
    content: row.content,
    create_at: utcToIso(row.create_at),
    mine: Boolean(me) && row.client_id === me
  };
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

  const url = new URL(request.url);
  const gallery = clip(url.searchParams.get('gallery'), 64);
  const photo = url.searchParams.get('photo');

  if (!gallery || !validPhotoIndex(photo)) {
    return json({ error: 'Invalid gallery/photo.' }, 400);
  }

  try {
    await ensureSchema(env.DB);

    const me = clientIdOf(request);

    const { results = [] } = await env.DB.prepare(`
      SELECT id, gallery_group, photo_index, content, client_id, create_at
      FROM photo_comments
      WHERE gallery_group = ? AND photo_index = ?
      ORDER BY create_at ASC
      LIMIT ?
    `).bind(gallery, Number(photo), MAX_LIST).all();

    return json({ comments: results.map((row) => shape(row, me)) });
  } catch (error) {
    console.error('photo-comments GET failed:', error);
    return json({ error: '加载评论失败，请稍后再试' }, 500);
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

  const gallery = clip(body && body.gallery_group, 64);
  const photoIndex = Number(body && body.photo_index);
  const content = clip(body && body.content, MAX_CONTENT);

  if (!gallery || !validPhotoIndex(photoIndex)) {
    return json({ error: '照片参数无效' }, 400);
  }
  if (!content) {
    return json({ error: '评论内容不能为空' }, 400);
  }

  try {
    await ensureSchema(env.DB);

    const { results: recent = [] } = await env.DB.prepare(`
      SELECT create_at FROM photo_comments
      WHERE client_id = ?
      ORDER BY create_at DESC
      LIMIT 1
    `).bind(clientId).all();

    if (recent.length) {
      const last = Date.parse(utcToIso(recent[0].create_at));
      if (Number.isFinite(last) && Date.now() - last < COOLDOWN_MS) {
        return json({ error: '发送太快了，请稍等几秒再试' }, 429);
      }
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await env.DB.prepare(`
      INSERT INTO photo_comments (id, gallery_group, photo_index, content, client_id, create_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, gallery, photoIndex, content, clientId, createdAt).run();

    return json({
      ok: true,
      comment: {
        id,
        gallery_group: gallery,
        photo_index: photoIndex,
        content,
        create_at: createdAt,
        mine: true
      }
    }, 201);
  } catch (error) {
    console.error('photo-comments POST failed:', error);
    return json({ error: '评论发送失败，请稍后再试' }, 500);
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

  const id = clip(body && body.id, 128);
  const rawClient = String((body && body.client_id) || '');
  const clientId = CLIENT_ID_RE.test(rawClient) ? rawClient : '';

  if (!id || !clientId) {
    return json({ error: '参数错误' }, 400);
  }

  try {
    await ensureSchema(env.DB);

    const result = await env.DB.prepare(`
      DELETE FROM photo_comments
      WHERE id = ? AND client_id = ?
    `).bind(id, clientId).run();

    const changes = result && result.meta ? result.meta.changes : 0;
    if (!changes) {
      return json({ error: '这条评论不存在，或者不是本机发布的' }, 404);
    }

    return json({ ok: true });
  } catch (error) {
    console.error('photo-comments DELETE failed:', error);
    return json({ error: '删除失败，请稍后再试' }, 500);
  }
}
