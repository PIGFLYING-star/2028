/**
 * Cloudflare Pages Functions 留言接口
 * 功能：
 * GET 获取留言
 * POST 发布留言
 *
 * 保持原 /api/messages 不变
 * 自动保证 messages 表存在
 * 不需要新建 D1，不需要执行 SQL 命令
 */

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=UTF-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store'
};


function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
  });
}


function cleanText(value, max = 200) {
  return String(value ?? '')
    .trim()
    .slice(0, max);
}


// 自动检查留言表
async function ensureMessagesTable(db) {

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      create_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

}



export async function onRequest(context) {

  const {
    request,
    env
  } = context;


  if (!env.DB) {

    return json(
      {
        error: 'D1 binding DB is not configured.'
      },
      500
    );

  }


  try {


    // 自动保证表存在
    await ensureMessagesTable(env.DB);



    const method = request.method.toUpperCase();



    // =========================
    // 获取留言
    // =========================

    if (method === 'GET') {


      const {
        results = []
      } = await env.DB.prepare(`
        SELECT
          id,
          content,
          create_at
        FROM messages
        ORDER BY create_at DESC
      `).all();



      return json(results);


    }





    // =========================
    // 发布留言
    // =========================

    if (method === 'POST') {


      const body =
        await request.json()
        .catch(() => null);



      const content =
        cleanText(body?.content);



      if (!content) {

        return json(
          {
            error: '留言内容不能为空'
          },
          400
        );

      }



      const result =
        await env.DB.prepare(`
          INSERT INTO messages
          (
            content
          )
          VALUES (?)
        `)
        .bind(content)
        .run();



      if (!result.success) {

        throw new Error(
          '写入数据库失败'
        );

      }



      return json(
        {
          success: true,
          message: '发布成功'
        }
      );


    }





    // 其他请求

    return json(
      {
        error: '不支持的请求方法'
      },
      405
    );



  } catch (err) {


    console.error(
      'messages API failed:',
      err
    );


    return json(
      {
        error: '服务器内部错误'
      },
      500
    );


  }


}
