"use strict"

import * as Comlink from "comlink";

import factory from '../wasm/mkv.js';
import { assert, assertNotReached } from './utils.js';
import { SHARED_ARRAY_BUFFER_INDEX } from "./atomics_enum.js"

class InputFileDevice {
  constructor(sync_sab, data_sab, send_read_request) {
    this._data_sab = data_sab;
    this._sync_int32_array = new Int32Array(sync_sab);
    this._send_read_request = send_read_request;
    this._pos = 0;
  }

  /*
   * @timeout {number} Time to wait in milliseconds
   * @return {bool} if timeout
   */
  block_wait(timeout = 0) {
    if (timeout == 0) {
      timeout = Infinity;
    }
    let result = Atomics.wait(this._sync_int32_array,
                              SHARED_ARRAY_BUFFER_INDEX.SEMAPHORE,
                              0, // main thread set this to 1 on new data
                              timeout);
    if (result === "timed-out") {
      return true;
    }
    return false;
  }

  // WARN: this function could not be async, because Emscripten does not allow...
  request_read(pos, buffer_max_length) {
    // NON-BLOCKING
    this._send_read_request(pos, buffer_max_length);

    // ***BLOCKING***
    let is_timeout = this.block_wait();
    if (is_timeout) {
      console.error("mkvThread block_wait timeout")
      return new ArrayBuffer();
    }

    let read_n = Atomics.load(this._sync_int32_array, SHARED_ARRAY_BUFFER_INDEX.READ_N);
    let ab = this._data_sab.slice(0, read_n);

    Atomics.store(this._sync_int32_array, SHARED_ARRAY_BUFFER_INDEX.SEMAPHORE, 0);
    Atomics.notify(this._sync_int32_array, SHARED_ARRAY_BUFFER_INDEX.SEMAPHORE);

    return ab;
  }

  /**
   * Implements the read() operation for the emulated device.
   * @param {!FileStream} stream
   * @param {!Int8Array} buffer The destination buffer.
   * @param {number} offset The destination buffer offset.
   * @param {number} length The maximum length to read.
   * @param {number} position The position to read from stream.
   * @return {number} The numbers of bytes read.
   */
  read(stream, buffer, offset, length, position) {
    let ab = this.request_read(this._pos, length)
    let read_n = ab.byteLength;
		console.log("read_n:", read_n, offset, ab)

    buffer.set(new Int8Array(ab), offset);

    // move file cursor forward
    this._pos += read_n;
    return read_n;
  }

  /**
   * Implements the llseek() operation for the emulated device.
   * Only SEEK_SET (0) is supported as |whence|. Reference:
   * https://emscripten.org/docs/api_reference/Filesystem-API.html#FS.llseek
   * @param {!FileStream} stream
   * @param {number} offset The offset in bytes relative to |whence|.
   * @param {number} whence The reference position to be used.
   * @return {number} The resulting file position.
   */
  llseek(stream, offset, whence) {
    assert(whence === 0, 'only SEEK_SET is supported');
    this._pos = offset;
		console.log("seek:", offset, whence);
    return offset;
  }

  getFileOps() {
    return {
      open: () => {},
      close: () => {},
      read: this.read.bind(this),
      write: () => assertNotReached('write should not be called'),
      llseek: this.llseek.bind(this),
    };
  }
}

function run_wasm(inputFile, callback) {
  const emscriten_config = {
    preRun: () => {
      const fs = emscriten_config.FS;
      const mkv_device = fs.makedev(80, 1);
      fs.registerDevice(mkv_device, inputFile.getFileOps());
      fs.mkdev('/input.mkv', mkv_device);
    },
  };
  
  return factory(emscriten_config).then(module => {
    let result = JSON.parse(module.ccall("get_matroska_video_info", "string", [], []));
    result.clusters = JSON.parse(result.clusters);

    console.table(result);
    return result
  });
}

class MkvWasmWorker {
  async get_mkv_info(...args) {
    let inputFile = new InputFileDevice(...args);
    return await run_wasm(inputFile);
  }
}

let worker = new MkvWasmWorker();
Comlink.expose(worker);
