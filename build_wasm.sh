# OPTIMIZATION_FLAGS="-Oz"
OPTIMIZATION_FLAGS="-O0"

rm -f wasm/*

ARGS=(
  -I./FFmpeg
  -L./FFmpeg/libavcodec -L./FFmpeg/libavformat -L./FFmpeg/libswresample -L./FFmpeg/libavutil
  -Qunused-arguments
	-o wasm/mkv.js src/wasm/mkv.c src/wasm/cJSON.c
	-lavformat -lavutil -lavcodec -lswresample
  $OPTIMIZATION_FLAGS
  # -s USE_PTHREADS=1               # enable pthreads support
  # -s INITIAL_MEMORY=33554432      # 33554432 bytes = 32 MB
  -s MODULARIZE -s EXPORT_ES6=1
  # --pre-js src/pre.js
  -s 'EXPORTED_RUNTIME_METHODS=["FS", "ccall"]'
  -s ENVIRONMENT='web'
  --emrun
)
emcc -v "${ARGS[@]}"

