#!/bin/sh
set -eu

export PORT="${PORT:-10000}"
export APP_URL="${APP_URL:-${RENDER_EXTERNAL_URL:-http://localhost:$PORT}}"
export CORS_ORIGIN="${FRONTEND_URL:?FRONTEND_URL is required}"
export API_URL="http://127.0.0.1:$PORT"
unset VITE_API_URL || true

# Render generates a bare base64 key; Laravel expects the prefix
case "${APP_KEY:?APP_KEY is required}" in
  base64:*) ;;
  *) export APP_KEY="base64:$APP_KEY" ;;
esac

envsubst '${PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

cd /var/www/html
mkdir -p storage/app/public storage/framework/cache/data storage/framework/sessions \
         storage/framework/views storage/logs bootstrap/cache

# Redis starts later, so boot-time commands must not depend on it
CACHE_STORE=array php artisan migrate --force
if [ "${SEED_DEMO:-false}" = "true" ]; then
  CACHE_STORE=array BROADCAST_CONNECTION=null php artisan codex:seed-demo
  CACHE_STORE=array php artisan trending:compute || echo "trending:compute failed, continuing"
fi
php artisan config:cache
php artisan route:cache
chown -R www-data:www-data storage bootstrap/cache

exec supervisord -c /etc/supervisord.conf
