/*
======================================================

 iOS 26 Liquid Glass Music Capsule Engine

 Graduation Website Edition


 功能:

 ✔ 播放/暂停
 ✔ 三首毕业歌曲
 ✔ 自动下一首
 ✔ 锁屏媒体控制
 ✔ Liquid Glass 状态同步
 ✔ Cloudflare Pages 兼容


======================================================
*/



// ===============================
// Playlist
// ===============================


const playlist = [


{
    title:"我们的青春",

    artist:"2026 Graduation",

    src:"/assets/music/youth.mp3"
},



{
    title:"毕业",

    artist:"Memory",

    src:"/assets/music/graduation.mp3"
},



{
    title:"未来可期",

    artist:"Class 2026",

    src:"/assets/music/memory.mp3"
}



];






// 当前歌曲

let currentIndex = 0;






// ===============================
// DOM
// ===============================


const audio =
document.querySelector("#audio-player");



const capsule =
document.querySelector("#musicCapsule");



const playButton =
document.querySelector("#capsulePlay");



const title =
document.querySelector(".music-mini-title");



const artist =
document.querySelector(".music-mini-sub");






// 防止页面没有播放器时报错

if(
!audio ||
!playButton
){

console.warn(
"Music Player DOM Missing"
);

}






// ===============================
// 加载歌曲
// ===============================


function loadSong(){


const song =
playlist[currentIndex];



audio.src =
song.src;



title.textContent =
song.title;



artist.textContent =
song.artist;



updateMediaSession();



}






// ===============================
// 播放
// ===============================


function playMusic(){



audio.play()

.then(()=>{


playButton.textContent="Ⅱ";



capsule.classList.add(
"playing"
);



})

.catch(error=>{


console.error(
"Audio Play Error:",
error
);



});



}







// ===============================
// 暂停
// ===============================


function pauseMusic(){



audio.pause();



playButton.textContent="▶";



capsule.classList.remove(
"playing"
);



}







// ===============================
// 播放按钮
// ===============================


playButton.onclick=function(e){



e.stopPropagation();



if(audio.paused){


playMusic();


}

else{


pauseMusic();


}


};








// ===============================
// 下一首
// ===============================


function nextSong(){



currentIndex++;



if(
currentIndex >= playlist.length
){

currentIndex=0;

}



loadSong();



playMusic();



}







audio.addEventListener(
"ended",
()=>{


nextSong();


});







// ===============================
// 错误检测
// ===============================


audio.addEventListener(
"error",
()=>{


console.error(

"音乐加载失败:",

audio.src

);


});







// ===============================
// Media Session
// 手机锁屏控制
// ===============================


function updateMediaSession(){



if(
!"mediaSession" in navigator
){

return;

}



const song =
playlist[currentIndex];



navigator.mediaSession.metadata =

new MediaMetadata({

title:
song.title,


artist:
song.artist,


album:
"2026 Graduation",



artwork:[

{

src:
"/assets/music/cover.jpg",

sizes:
"512x512",

type:
"image/jpeg"

}

]


});






navigator.mediaSession.setActionHandler(

"play",

()=>{

playMusic();

}

);



navigator.mediaSession.setActionHandler(

"pause",

()=>{

pauseMusic();

}

);



navigator.mediaSession.setActionHandler(

"nexttrack",

()=>{


nextSong();


}

);



}








// ===============================
// 点击外部自动收缩
// ===============================


document.addEventListener(
"click",

(e)=>{


if(
!capsule.contains(e.target)
){

capsule.classList.remove(
"active"
);

}


});








// ===============================
// 点击胶囊展开
// ===============================


capsule.onclick=function(){


capsule.classList.toggle(
"active"
);


};








// ===============================
// 初始化
// ===============================


loadSong();



console.log(

"🎵 iOS 26 Music Capsule Ready"

);