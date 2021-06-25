"use strict"

import * as Comlink from "comlink";
import MkvWorker from "./mkv-worker.js";

import { assert, assertNotReached } from "./utils.js"
import { SHARED_ARRAY_BUFFER_INDEX } from "./atomics_enum.js"

export class MkvWasmParser {
  /*
   * @read_cb {Function} get read result by offet, return read promise
   */
  constructor(read_cb) {
    this._read_cb = read_cb;

    this._mkv_worker = Comlink.wrap(new MkvWorker());

    this._sync_sab = new SharedArrayBuffer(1024);
    this._sync_int32_array = new Int32Array(this._sync_sab);

    this._data_sab = new SharedArrayBuffer(1024 * 1024); // 1 MB buffer
  }

  async send_read_request(...args) {
    let ab;
    try {
      ab = await this._read_cb(...args);
    } catch(err) {
      console.error("mkvparser _read_cb met error:", err);
      return;
    }

    if (ab.byteLength > 0) {
      assert(this._data_sab.byteLength >= ab.byteLength);

      let sab_view = new Int8Array(this._data_sab);
      let ab_view = new Int8Array(ab);
      sab_view.set(ab_view, 0);

      Atomics.store(this._sync_int32_array, SHARED_ARRAY_BUFFER_INDEX.READ_N, ab.byteLength);
      Atomics.store(this._sync_int32_array, SHARED_ARRAY_BUFFER_INDEX.SEMAPHORE, 1);
      Atomics.notify(this._sync_int32_array, SHARED_ARRAY_BUFFER_INDEX.SEMAPHORE);
    }
  }

  /*
   * @returns {promise} which resolves to mkv info
   */
  run() {
    return this._mkv_worker.get_mkv_info(
      this._sync_sab,
      this._data_sab,
      Comlink.proxy(this.send_read_request.bind(this))
    );
  }
}
