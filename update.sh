#!/usr/bin/env bash
set -e

APP_DIR="$HOME/altraradius"
API_DIR="$APP_DIR/radius-api"
PUBLIC_DIR="$APP_DIR/public"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -d "$API_DIR" ]; then
  echo "Direktori $API_DIR tidak ditemukan. Jalankan ./install.sh terlebih dahulu."
  exit 1
fi

echo "Memperbarui file aplikasi altraRADIUS di $APP_DIR (tanpa menimpa .env & database)..."
cp "$SCRIPT_DIR/schema.sql" "$APP_DIR/schema.sql"
cp "$SCRIPT_DIR/radius-api/package.json" "$API_DIR/package.json"
cp "$SCRIPT_DIR/radius-api/server.js" "$API_DIR/server.js"
cp "$SCRIPT_DIR/radius-api/telegramNotifier.js" "$API_DIR/telegramNotifier.js"
cp "$SCRIPT_DIR/public/index.html" "$PUBLIC_DIR/index.html"

cd "$API_DIR"
npm install --omit=dev

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart altraradius-api --update-env || pm2 start server.js --name "altraradius-api" --update-env
  pm2 save
fi

echo "Update altraRADIUS selesai!"
