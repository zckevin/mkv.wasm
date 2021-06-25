#include <emscripten.h>

#include "libavformat/avformat.h"
#include "libavformat/internal.h"

#include "cJSON.h"

int get_first_stream_index_by_type(AVFormatContext *pFormatCtx, enum AVMediaType code_type) {
    int videoStream = -1;
    for (int i = 0; i < pFormatCtx->nb_streams; i++) {
        if (pFormatCtx->streams[i]->codecpar->codec_type == code_type) {
            videoStream = i;
            break;
        }
    }
    return videoStream;
}

const char* serialize_clusters_positions(AVStream* st) {
  char *result = NULL;
  cJSON *entry;
  // cJSON *start, *end;
  cJSON *start, *timestamp;
  cJSON *arr = cJSON_CreateArray();
  if (arr == NULL) {
    goto end;
  }

  int n = avformat_index_get_entries_count(st);
  for (int i = 0; i < n; i++) {
    entry = cJSON_CreateObject();
    if (entry == NULL) {
      goto end;
    }
    cJSON_AddItemToArray(arr, entry);

    start = cJSON_CreateNumber(avformat_index_get_entry(st, i)->pos);
    if (start == NULL) {
      goto end;
    }
    cJSON_AddItemToObject(entry, "start", start);

    timestamp = cJSON_CreateNumber(avformat_index_get_entry(st, i)->timestamp);
    if (start == NULL) {
      goto end;
    }
    cJSON_AddItemToObject(entry, "timestamp", timestamp);
  }

  result = cJSON_Print(arr);
  if (result == NULL) {
    fprintf(stderr, "Failed to serialize entries.\n");
  }

end:
  cJSON_Delete(arr);
  return result;
}

AVFormatContext* create_context(const char* filename) {
  // allocate av context
  AVFormatContext *ic = avformat_alloc_context();

  // open media file
  if (avformat_open_input(&ic, filename, NULL, NULL) < 0) {
    fprintf(stderr, "avformat_open_input error.\n");
    return NULL;
  }

  // maybe try parsing some packets/data to get stream info?
  if (avformat_find_stream_info(ic, NULL) < 0) {
    fprintf(stderr, "avformat_find_stream_info error.\n");
    return NULL;
  }

  // debug dumping ffmpeg stream info banner
  av_dump_format(ic, 0, "", 0);
  
  // need a seek to probe AVstream, and make stream->internal->index_entries fullfill?
  if (avformat_seek_file(ic, -1, INT64_MIN, 1, INT64_MAX, 0) < 0) {
    fprintf(stderr, "avformat_seek_file error.\n");
    return NULL;
  }

  return ic;
}

AVStream* get_video_avstream(AVFormatContext* ic) {
  int video_stream_index = get_first_stream_index_by_type(ic, AVMEDIA_TYPE_VIDEO);
  if (video_stream_index >= 0) {
    return ic->streams[video_stream_index];
  }
  return NULL;
}

AVStream* get_audio_avstream(AVFormatContext* ic) {
  int audio_stream_index = get_first_stream_index_by_type(ic, AVMEDIA_TYPE_AUDIO);
  if (audio_stream_index >= 0) {
    return ic->streams[audio_stream_index];
  }
  return NULL;
}

const char* build_matroska_clusters_positions(AVStream* video_st) {
  const char* json_result = serialize_clusters_positions(video_st);
  return json_result ? json_result : "[]";
}

#define ADD_STRING_KV_TO_CJSON_OBJECT(obj, key, value) \
  key = cJSON_CreateString(value); \
  if (key == NULL) { \
    goto end; \
  } \
  cJSON_AddItemToObject(obj, #key, key);
  
EMSCRIPTEN_KEEPALIVE
const char* get_matroska_video_info() {
  // file name specified in mkv-worker.js's Emscripten config
  const char* default_wasm_filename = "/input.mkv";

  AVFormatContext* ctx = create_context(default_wasm_filename);
  if (ctx == NULL) {
    goto end;
  }

  AVStream* video_st = get_video_avstream(ctx);
  if (video_st == NULL) {
    fprintf(stderr, "Could not find video stream in file.");
    goto end;
  }

  AVStream* audio_st = get_audio_avstream(ctx);
  if (audio_st == NULL) {
    fprintf(stderr, "Could not find audio stream in file.");
    goto end;
  }

  char *final_json_str = NULL;
  cJSON *obj = NULL;
  {
    cJSON *clusters = NULL;
    cJSON *video_codec = NULL;
    cJSON *audio_codec = NULL;

    obj = cJSON_CreateObject();
    if (obj == NULL) {
      goto end;
    }

    const char* cluster_positions = build_matroska_clusters_positions(video_st);
    ADD_STRING_KV_TO_CJSON_OBJECT(obj, clusters, cluster_positions);

    const char* video_codec_str = avcodec_get_name(video_st->internal->avctx->codec_id);
    ADD_STRING_KV_TO_CJSON_OBJECT(obj, video_codec, video_codec_str);

    const char* audio_codec_str = avcodec_get_name(audio_st->internal->avctx->codec_id);
    ADD_STRING_KV_TO_CJSON_OBJECT(obj, audio_codec, audio_codec_str);

    final_json_str = cJSON_Print(obj);
    if (final_json_str == NULL) {
      fprintf(stderr, "Failed to serialize entries.\n");
    }
  }

end:
  cJSON_Delete(obj);
  return final_json_str ? final_json_str : "{}";
}

/*
int main(int argc, char* argv[]) {
  if (argc != 3) {
    fprintf(stderr, "./a.out $FILE $SEEK_TIME.\n");
    return -1;
  }
  const char* filename = argv[1];
  int64_t ts = strtod(argv[2], NULL) * 1000;

  AVStream* st = get_video_avstream(filename);

  const AVIndexEntry* entry =
      avformat_index_get_entry_from_timestamp(st, ts, 0);
  fprintf(stdout, "index: pos(%d) size(%d) ts(%d)\n", entry->pos, entry->size, entry->timestamp);

  // int64_t start_pos = -1, end_pos = -1;
  // if (avformat_get_offset_range_from_timestamp(ic->streams[video_stream_index], ts, 0, &start_pos, &end_pos)) {
  //   fprintf(stdout, "index: start(%lld) end(%lld) ts(%lld)\n", start_pos, end_pos, ts);
  // }
  return 0;
}
*/
