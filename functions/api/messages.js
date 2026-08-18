/**
 * Cloudflare Pages Functions 留言接口
 * 功能：GET获取所有留言、POST提交新留言、DELETE删除本人留言
 * 绑定：D1数据库环境变量名为 DB
 */

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  // 统一设置响应头
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  // 处理预检请求
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  // 1. GET请求：获取全部留言（时间倒序）
  if (method === 'GET') {
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, content, client_id, create_at FROM messages ORDER BY create_at DESC`
      ).all();

      return new Response(JSON.stringify(results), { headers });
    } catch (err) {
      console.error('查询失败:', err);
      return new Response(
        JSON.stringify({ error: '服务器内部错误' }),
        { status: 500, headers }
      );
    }
  }

  // 2. POST请求：提交新留言
  if (method === 'POST') {
    try {
      const body = await request.json().catch(() => null);
      // 参数校验
      if (!body || !body.content?.trim() || !body.client_id?.trim()) {
        return new Response(
          JSON.stringify({ error: '参数不完整' }),
          { status: 400, headers }
        );
      }

      const content = body.content.trim();
      const clientId = body.client_id.trim();

      // 写入数据库
      const result = await env.DB.prepare(
        `INSERT INTO messages (content, client_id) VALUES (?, ?)`
      ).bind(content, clientId).run();

      if (!result.success) throw new Error('写入失败');

      return new Response(
        JSON.stringify({ success: true, message: '发布成功' }),
        { status: 200, headers }
      );

    } catch (err) {
      console.error('提交失败:', err);
      return new Response(
        JSON.stringify({ error: '发布失败，请稍后重试' }),
        { status: 500, headers }
      );
    }
  }

  // 3. DELETE请求：删除本人留言
  if (method === 'DELETE') {
    try {
      const body = await request.json().catch(() => null);
      if (!body || !body.id || !body.client_id) {
        return new Response(
          JSON.stringify({ error: '参数不完整' }),
          { status: 400, headers }
        );
      }

      // 校验：只能删除 client_id 匹配的留言
      const result = await env.DB.prepare(
        `DELETE FROM messages WHERE id = ? AND client_id = ?`
      ).bind(body.id, body.client_id).run();

      // 影响行数为0说明无权限或留言不存在
      if (result.meta.changes === 0) {
        return new Response(
          JSON.stringify({ error: '删除失败，无权限或留言不存在' }),
          { status: 403, headers }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: '删除成功' }),
        { status: 200, headers }
      );

    } catch (err) {
      console.error('删除失败:', err);
      return new Response(
        JSON.stringify({ error: '删除失败，请稍后重试' }),
        { status: 500, headers }
      );
    }
  }

  // 其他方法返回405
  return new Response(
    JSON.stringify({ error: '不支持的请求方法' }),
    { status: 405, headers }
  );
}
