/**
 * Cloudflare Pages Functions 留言接口
 *
 * 功能：
 * GET    获取留言
 * POST   发布留言
 * DELETE 删除留言
 *
 * API:
 * /api/messages
 */

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=UTF-8",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store"
};


function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
  });
}


function cleanText(value, max = 200) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}


// 自动创建留言表
async function ensureMessagesTable(db) {

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      client_id TEXT,
      create_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();


  // 兼容旧数据库
  try {

    await db.prepare(`
      ALTER TABLE messages
      ADD COLUMN client_id TEXT
    `).run();

  } catch (e) {
    // 已存在字段，忽略
  }

}



export async function onRequest(context) {

  const {
    request,
    env
  } = context;


  if (!env.DB) {

    return json({
      error: "D1 binding DB is not configured."
    }, 500);

  }


  try {


    await ensureMessagesTable(env.DB);


    const method =
      request.method.toUpperCase();



    // =====================
    // GET 获取留言
    // =====================

    if (method === "GET") {


      const {
        results = []
      } = await env.DB.prepare(`
        SELECT
          id,
          content,
          client_id,
          create_at
        FROM messages
        ORDER BY create_at DESC
      `).all();


      return json(results);

    }





    // =====================
    // POST 发布留言
    // =====================

    if (method === "POST") {


      const body =
        await request.json()
        .catch(() => null);


      const content =
        cleanText(body?.content);


      const client_id =
        cleanText(body?.client_id,100);



      if (!content) {

        return json({
          error:"留言内容不能为空"
        },400);

      }



      const result =
        await env.DB.prepare(`
          INSERT INTO messages
          (
            content,
            client_id
          )
          VALUES (?,?)
        `)
        .bind(
          content,
          client_id
        )
        .run();



      if (!result.success) {

        throw new Error(
          "写入数据库失败"
        );

      }



      return json({
        success:true,
        message:"发布成功"
      });


    }





    // =====================
    // DELETE 删除留言
    // =====================

    if (method === "DELETE") {


      const body =
        await request.json()
        .catch(() => null);



      const id =
        Number(body?.id);


      const client_id =
        cleanText(body?.client_id,100);



      if (!id || !client_id) {

        return json({
          error:"参数错误"
        },400);

      }



      const result =
        await env.DB.prepare(`
          DELETE FROM messages
          WHERE id = ?
          AND client_id = ?
        `)
        .bind(
          id,
          client_id
        )
        .run();



      if (!result.success) {

        throw new Error(
          "删除失败"
        );

      }



      return json({
        success:true,
        message:"删除成功"
      });


    }





    // 不支持的方法

    return json({
      error:"不支持的请求方法"
    },405);



  } catch(err) {


    console.error(
      "messages API failed:",
      err
    );


    return json({
      error:"服务器内部错误",
      detail:String(err.message || err)
    },500);


  }

}
