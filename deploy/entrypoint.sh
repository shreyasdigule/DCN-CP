#!/bin/sh
set -eu

: "${PORT:=8080}"
: "${API_UPSTREAM:=127.0.0.1:8000}"
: "${RUN_API:=true}"

export PORT API_UPSTREAM
envsubst '${PORT} ${API_UPSTREAM}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

if [ "$RUN_API" = "true" ]; then
  uvicorn subnet_design.api:app --host 127.0.0.1 --port 8000 &
fi

exec nginx -g 'daemon off;'
