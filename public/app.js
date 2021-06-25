"use strict"

import * as _module from "./bundle.js"

let video_ab;
let video_segments = [];

function createMse() {
  return new Promise(resolve => {
    const v = document.createElement('video');
    document.body.appendChild(v);
    const mediaSource = new MediaSource();
    const url = URL.createObjectURL(mediaSource);
    mediaSource.addEventListener('sourceopen', () => {
      URL.revokeObjectURL(url);
      resolve([v, mediaSource]);
    });
    v.src = url;
  })
}

function getVideoSegment(start, end) {
  console.assert(video_ab != undefined);
  console.assert(start <= end && start >= 0);
  return video_ab.slice(start, end);
}

function getVideoMetaSegment() {
  console.assert(video_segments && video_segments.length > 0);
  let start = 0;
  let end = video_segments[0].start;
  return getVideoSegment(start, end);
}

function getVideoSegmentByIndex(index) {
  if (index >= video_segments.length) {
    return;
  }
  console.assert(video_segments && video_segments.length > 0);
  let start = video_segments[index].start;
  let end = video_segments[index + 1] ? video_segments[index + 1].start : Infinity;
  return getVideoSegment(start, end);
}

function getVideoSegmentByTime(ts) {
  console.assert(video_segments && video_segments.length > 0);
  let index = video_segments.length - 1;
  for (let i = 0; i < video_segments.length; i++) {
    if (video_segments[i].timestamp >= ts) {
      index = i;
      break;
    }
  }
  return getVideoSegmentByIndex(index);
}

async function run_player() {
  let [ v, mediaSource ] = await createMse(); 
  let sb = mediaSource.addSourceBuffer('video/webm; codecs="vp8, vorbis"');

  let i = 0;
  let stopped = false;
  let chunk = getVideoMetaSegment();
  if (!chunk) {
    stopped = true;
  }
  console.log("append meta", chunk);
  sb.appendBuffer(chunk);

  function do_append() {
    if (!stopped) {
      let chunk = getVideoSegmentByIndex(i++);
      if (!chunk) {
        stopped = true;
        mediaSource.endOfStream();
      } else {
         if (i <= 5) {
           console.log("skip:", i);
           return;
         }
        console.log("append:", i, chunk);
        sb.appendBuffer(chunk);
      }
    }
  }

  setInterval(() => {
    do_append();
  }, 200)

  sb.addEventListener('updateend', async () => {
    do_append();
  })

  v.controls = true;
  v.muted = true; // for v.play() to work
  v.currentTime = 4.2;
  v.play(); 
}


fetch("./test.webm").then(async (resp) => {
  video_ab = await resp.arrayBuffer();

  function read_cb(pos, buffer_max_length) {
    return Promise.resolve(video_ab.slice(pos, pos + buffer_max_length));
  }

  let worker = new MkvWasmParser(read_cb);
  let mkv_info = await worker.run();
  video_segments = mkv_info.clusters;
  run_player();
})

