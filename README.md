# mkv.wasm

Using emscriptened ffmpeg to parse Matroska Cues and fetch clusters and codec info,
using MSE to play the video.

[VIDEO PLAYER DEMO](https://mkv-wasm.pages.dev/player)

## Design

- ui/main thread
```
  resultCh := make(chan ArrayBuffer)

  async function exec_request(req) {
    let chunk = await do_read_async(req);
    let resp = { req, chunk };
    resultCh <- resp;
  }
```

- mkv wasm parser, web worker
```
  file_ops = {
    // MUST be sync
    read(mem_buffer, offset, pos, max_buffer_len) {
      let ab = _do_read(pos, max_buffer_len);
      if (ab.byteLength > 0) {
        mem_buffer.set(ab, offset);
        return ab.byteLength;
      }
      return 0;
    },

    llseek(steam, offset) {
      this._read_pos = offset;

      // we DON'T have any pending requests in a single-thread sync read env...
      // this.cancel_pendings_requests();
    }
  };

  function _do_read(...args) {
    let req = create_new_request(...args);

    // NON-BLOCKING
    this._main_thread_exec_request(req);
    
    // ***BLOCKING***
    let resp = <-this._main_thread_result_ch;
    if (resp.req === req) {
      return resp.chunk;
    }
    return new ArrayBuffer();
  }
```
