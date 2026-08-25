function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      }
    }
  );
}


function cleanText(value, max = 500) {

  return String(value ?? "")
    .trim()
    .slice(0, max);

}


function validClientId(id){

  return /^[a-zA-Z0-9_-]{1,128}$/.test(id);

}



// 自动创建评论表
async function ensureTable(db){

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS photo_comments (

      id INTEGER PRIMARY KEY AUTOINCREMENT,

      gallery_group TEXT NOT NULL,

      photo_index INTEGER NOT NULL,

      content TEXT NOT NULL,

      client_id TEXT NOT NULL,

      create_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP

    )
  `)
  .run();

}




export async function onRequest(context){

  const {
    request,
    env
  } = context;



  if(!env.DB){

    return json(
      {
        error:"D1 binding DB is not configured."
      },
     500
    );

  }



  try{


    await ensureTable(env.DB);



    const method =
      request.method.toUpperCase();




    // ============================
    // GET 获取评论
    // ============================

    if(method==="GET"){


      const url =
        new URL(request.url);



      const gallery =
        cleanText(
          url.searchParams.get("gallery"),
          200
        );


      const photo =
        Number(
          url.searchParams.get("photo")
        );



      if(!gallery || Number.isNaN(photo)){

        return json(
          {
            error:"Invalid parameters."
          },
         400
        );

      }



      const result =
        await env.DB.prepare(`
          SELECT
            id,
            gallery_group,
            photo_index,
            content,
            client_id,
            create_at

          FROM photo_comments

          WHERE gallery_group=?
          AND photo_index=?

          ORDER BY id ASC
        `)
        .bind(
          gallery,
          photo
        )
        .all();



      return json({

        comments:
          result.results || []

      });



    }







    // ============================
    // POST 发布评论
    // ============================

    if(method==="POST"){


      const body =
        await request.json()
        .catch(()=>null);



      const gallery =
        cleanText(
          body?.gallery,
          200
        );


      const photo =
        Number(
          body?.photo
        );


      const content =
        cleanText(
          body?.content,
          500
        );


      const clientId =
        cleanText(
          body?.client_id,
          128
        );



      if(
        !gallery ||
        Number.isNaN(photo) ||
        !content ||
        !validClientId(clientId)
      ){

        return json(
          {
            error:"Invalid request."
          },
         400
        );

      }





      await env.DB.prepare(`
        INSERT INTO photo_comments
        (
          gallery_group,
          photo_index,
          content,
          client_id
        )

        VALUES(?,?,?,?)

      `)
      .bind(
        gallery,
        photo,
        content,
        clientId
      )
      .run();




      return json({

        ok:true

      });



    }







    // ============================
    // DELETE 删除评论
    // ============================

    if(method==="DELETE"){


      const body =
        await request.json()
        .catch(()=>null);



      const id =
        cleanText(
          body?.id,
          128
        );


      const clientId =
        cleanText(
          body?.client_id,
          128
        );



      if(
        !id ||
        !validClientId(clientId)
      ){

        return json(
          {
            error:"Invalid request."
          },
         400
        );

      }




      await env.DB.prepare(`
        DELETE FROM photo_comments

        WHERE id=?

        AND client_id=?

      `)
      .bind(
        id,
        clientId
      )
      .run();




      return json({

        ok:true

      });



    }






    // ============================
    // OPTIONS 跨域
    // ============================

    if(method==="OPTIONS"){

      return new Response(
        null,
        {
          headers:{
            "Access-Control-Allow-Origin":"*",

            "Access-Control-Allow-Methods":
              "GET,POST,DELETE,OPTIONS",

            "Access-Control-Allow-Headers":
              "Content-Type"
          }
        }
      );

    }





    return json(
      {
        error:"Method not allowed."
      },
     405
    );



  }catch(error){


    console.error(
      "photo-comments error:",
      error
    );


    return json(
      {
        error:"Server error."
      },
     500
    );


  }

}
