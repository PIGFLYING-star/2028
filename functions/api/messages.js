/**
 * Cloudflare Pages Functions 留言接口
 * 功能：GET获取所有留言（倒序）、POST提交新留言
 * 绑定：需要在Pages项目中绑定D1数据库，环境变量名为 DB
 */

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  // 处理GET请求：获取留言列表
  if (method === 'GET') {
    try {
      // 按创建时间倒序查询，最新的在最前面
      const { results } = await env.DB.prepare(
        `SELECT id, content, create_at FROM messages ORDER BY create_at DESC`
      ).all();

      return new Response(JSON.stringify(results), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (err) {
      console.error('查询数据库失败:', err);
      return new Response(
        JSON.stringify({ error: '服务器内部错误' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // 处理POST请求：提交新留言
  if (method === 'POST') {
    try {
      // 解析请求体
      const body = await request.json().catch(() => null);
      if (!body || !body.content || !body.content.trim()) {
        return new Response(
          JSON.stringify({ error: '留言内容不能为空' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const content = body.content.trim();
      // 插入数据库，create_at默认自动生成当前时间
      const result = await env.DB.prepare(
        `INSERT INTO messages (content) VALUES (?)`
      ).bind(content).run();

      if (!result.success) {
        throw new Error('写入数据库失败');
      }

      return new Response(
        JSON.stringify({ success: true, message: '发布成功' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    } catch (err) {
      console.error('提交留言失败:', err);
      return new Response(
        JSON.stringify({ error: '发布失败，请稍后重试' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // 其他请求方法返回405
  return new Response(
    JSON.stringify({ error: '不支持的请求方法' }),
    { status: 405, headers: { 'Content-Type': 'application/json' } }
  );
}
