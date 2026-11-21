#!/usr/bin/env bash
set -e

APP_DIR="$HOME/freeradius-hotspot"
API_DIR="$APP_DIR/radius-api"
PUBLIC_DIR="$APP_DIR/public"
DB_NAME="radius_db"
DB_USER="radius"
APP_PORT="3030"

DB_PASS=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)
API_KEY=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
DEFAULT_ADMIN_USER="admin"
DEFAULT_ADMIN_PASS="AdminHotspot123!"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$API_DIR" "$PUBLIC_DIR"
cp "$SCRIPT_DIR/schema.sql" "$APP_DIR/schema.sql"
cp "$SCRIPT_DIR/radius-api/package.json" "$API_DIR/package.json"
cp "$SCRIPT_DIR/radius-api/server.js" "$API_DIR/server.js"
cp "$SCRIPT_DIR/radius-api/telegramNotifier.js" "$API_DIR/telegramNotifier.js"
cp "$SCRIPT_DIR/public/index.html" "$PUBLIC_DIR/index.html"

cat << ENVEOF > "$API_DIR/.env"
PORT=$APP_PORT
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=$DB_USER
DB_PASS=$DB_PASS
DB_NAME=$DB_NAME
API_SECRET_KEY=$API_KEY
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=12h
DEFAULT_ADMIN_USER=$DEFAULT_ADMIN_USER
DEFAULT_ADMIN_PASS=$DEFAULT_ADMIN_PASS
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TG_POLL_INTERVAL_SEC=10
TG_NAS_PING_INTERVAL_SEC=60
ENVEOF

cd "$API_DIR"
npm install --omit=dev

sudo mysql -u root < "$APP_DIR/schema.sql"
sudo mysql -u root -e "CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASS';"
sudo mysql -u root -e "CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';"
sudo mysql -u root -e "GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'127.0.0.1';"
sudo mysql -u root -e "GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'localhost';"
sudo mysql -u root -e "FLUSH PRIVILEGES;"

echo "Selesai! Port: $APP_PORT | Admin: $DEFAULT_ADMIN_USER | Pass: $DEFAULT_ADMIN_PASS | DB Pass: $DB_PASS"
