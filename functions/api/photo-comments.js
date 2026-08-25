const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=UTF-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*'
};


function json(data, status = 200) {

  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: JSON_HEADERS
    }
  );

}



function cleanText(value, max = 200) {

  return String(value ?? '')
    .trim()
    .slice(0, max);

}



function validClientId(value) {

  return /^[A-Za-z0-9._:-]{8,128}$/
    .test(String(value ?? ''));

}



function validPhotoIndex(value) {

  const n = Number(value);

  return Number.isInteger(n)
    && n >= 0
    && n <= 999;

}



async function ensureTable(db) {

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

    ON photo_comments
    (
      gallery_group,
      photo_index,
      create_at
    )

  `).run();

}






// =========================
// 获取评论
// =========================

export async function onRequestGet({
  request,
  env
}) {


  if(!env.DB){

    return json(
      {
        error:'D1 binding DB is not configured.'
      },
      500
    );

  }



  const url =
    new URL(request.url);



  const gallery =
    cleanText(
      url.searchParams.get('gallery'),
      64
    );



  const photo =
    url.searchParams.get('photo');



  if(
    !gallery ||
    !validPhotoIndex(photo)
  ){

    return json(
      {
        error:'Invalid gallery/photo.'
      },
      400
    );

  }



  try{


    await ensureTable(env.DB);



    const {
      results=[]
    } =
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


      ORDER BY create_at ASC


      LIMIT 50


    `)
    .bind(
      gallery,
      Number(photo)
    )
    .all();



    return json({

      comments:results

    });



  }catch(error){


    console.error(
      'photo-comments GET failed',
      error
    );


    return json(
      {
        error:'Failed to load photo comments.'
      },
      500
    );

  }

}








// =========================
// 发布评论
// =========================

export async function onRequestPost({
  request,
  env
}) {


  if(!env.DB){

    return json(
      {
        error:'D1 binding DB is not configured.'
      },
      500
    );

  }



  let body;


  try{

    body =
      await request.json();


  }catch{


    return json(
      {
        error:'Invalid JSON.'
      },
      400
    );

  }





  const gallery =
    cleanText(
      body?.gallery_group,
      64
    );



  const photoIndex =
    Number(
      body?.photo_index
    );



  const content =
    cleanText(
      body?.content,
      200
    );



  const clientId =
    cleanText(
      body?.client_id,
      128
    );





  if(
    !gallery ||
    !validPhotoIndex(photoIndex)
  ){

    return json(
      {
        error:'Invalid gallery/photo.'
      },
      400
    );

  }



  if(!content){

    return json(
      {
        error:'Comment cannot be empty.'
      },
      400
    );

  }



  if(!validClientId(clientId)){


    return json(
      {
        error:'Invalid client_id.'
      },
      400
    );

  }






  try{


    await ensureTable(env.DB);



    const id =
      crypto.randomUUID();



    const createdAt =
      new Date().toISOString();





    await env.DB.prepare(`

      INSERT INTO photo_comments

      (

        id,

        gallery_group,

        photo_index,

        content,

        client_id,

        create_at

      )


      VALUES (?,?,?,?,?,?)


    `)
    .bind(

      id,

      gallery,

      photoIndex,

      content,

      clientId,

      createdAt

    )
    .run();





    return json(

      {

        ok:true,

        comment:{

          id,

          gallery_group:gallery,

          photo_index:photoIndex,

          content,

          client_id:clientId,

          create_at:createdAt

        }

      },

      201

    );



  }catch(error){


    console.error(
      'photo-comments POST failed',
      error
    );


    return json(
      {
        error:'Failed to save photo comment.'
      },
      500
    );

  }

}









// =========================
// 删除评论
// =========================

export async function onRequestDelete({
  request,
  env
}) {


  if(!env.DB){

    return json(
      {
        error:'D1 binding DB is not configured.'
      },
      500
    );

  }




  let body;


  try{

    body =
      await request.json();

  }catch{


    return json(
      {
        error:'Invalid JSON.'
      },
      400
    );

  }





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
        error:'Invalid delete request.'
      },
      400
    );

  }






  try{


    await ensureTable(env.DB);



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





  }catch(error){


    console.error(
      'photo-comments DELETE failed',
      error
    );


    return json(
      {
        error:'Failed to delete photo comment.'
      },
      500
    );

  }

}








// =========================
// OPTIONS
// =========================

export async function onRequestOptions(){

  return new Response(

    null,

    {

      status:204,


      headers:{


        'Access-Control-Allow-Origin':'*',


        'Access-Control-Allow-Methods':

          'GET,POST,DELETE,OPTIONS',



        'Access-Control-Allow-Headers':

          'Content-Type, Accept'


      }

    }

  );

}
