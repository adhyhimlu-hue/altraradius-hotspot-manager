REPO_URL="https://github.com/adhyhimlu-hue/altraradius-hotspot-manager.git"
WORKDIR="$HOME/freeradius-hotspot-git"

mkdir -p "$WORKDIR/radius-api" "$WORKDIR/public"
cd "$WORKDIR"

# 1. .gitignore
cat << 'EOF' > .gitignore
node_modules/
.env
radius-api/.env
*.log
EOF

# 2. schema.sql
cat << 'EOF' > schema.sql
CREATE DATABASE IF NOT EXISTS radius_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE radius_db;

CREATE TABLE IF NOT EXISTS nas (
  id INT(10) NOT NULL AUTO_INCREMENT,
  nasname VARCHAR(128) NOT NULL,
  shortname VARCHAR(32),
  type VARCHAR(30) DEFAULT 'other',
  ports INT(5),
  secret VARCHAR(60) NOT NULL DEFAULT 'secret',
  server VARCHAR(64),
  community VARCHAR(50),
  description VARCHAR(200) DEFAULT 'RADIUS Client',
  PRIMARY KEY (id),
  KEY nasname (nasname)
);

CREATE TABLE IF NOT EXISTS radcheck (
  id INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL DEFAULT '',
  attribute VARCHAR(64) NOT NULL DEFAULT '',
  op CHAR(2) NOT NULL DEFAULT ':=',
  value VARCHAR(253) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY username (username(32))
);

CREATE TABLE IF NOT EXISTS radreply (
  id INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL DEFAULT '',
  attribute VARCHAR(64) NOT NULL DEFAULT '',
  op CHAR(2) NOT NULL DEFAULT '=',
  value VARCHAR(253) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY username (username(32))
);

CREATE TABLE IF NOT EXISTS radgroupreply (
  id INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  groupname VARCHAR(64) NOT NULL DEFAULT '',
  attribute VARCHAR(64) NOT NULL DEFAULT '',
  op CHAR(2) NOT NULL DEFAULT '=',
  value VARCHAR(253) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY groupname (groupname(32))
);

CREATE TABLE IF NOT EXISTS radusergroup (
  id INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL DEFAULT '',
  groupname VARCHAR(64) NOT NULL DEFAULT '',
  priority INT(11) NOT NULL DEFAULT '1',
  PRIMARY KEY (id),
  KEY username (username(32))
);

CREATE TABLE IF NOT EXISTS radacct (
  radacctid BIGINT(21) NOT NULL AUTO_INCREMENT,
  acctsessionid VARCHAR(64) NOT NULL DEFAULT '',
  acctuniqueid VARCHAR(32) NOT NULL DEFAULT '',
  username VARCHAR(64) NOT NULL DEFAULT '',
  groupname VARCHAR(64) NOT NULL DEFAULT '',
  realm VARCHAR(64) DEFAULT '',
  nasipaddress VARCHAR(15) NOT NULL DEFAULT '',
  nasportid VARCHAR(32) DEFAULT NULL,
  nasporttype VARCHAR(32) DEFAULT NULL,
  acctstarttime DATETIME NULL DEFAULT NULL,
  acctupdatetime DATETIME NULL DEFAULT NULL,
  acctstoptime DATETIME NULL DEFAULT NULL,
  acctinterval INT(12) DEFAULT NULL,
  acctsessiontime INT(12) UNSIGNED DEFAULT NULL,
  acctauthentic VARCHAR(32) DEFAULT NULL,
  connectinfo_start VARCHAR(50) DEFAULT NULL,
  connectinfo_stop VARCHAR(50) DEFAULT NULL,
  acctinputoctets BIGINT(20) DEFAULT NULL,
  acctoutputoctets BIGINT(20) DEFAULT NULL,
  calledstationid VARCHAR(50) NOT NULL DEFAULT '',
  callingstationid VARCHAR(50) NOT NULL DEFAULT '',
  acctterminatecause VARCHAR(32) NOT NULL DEFAULT '',
  servicetype VARCHAR(32) DEFAULT NULL,
  framedprotocol VARCHAR(32) DEFAULT NULL,
  framedipaddress VARCHAR(15) NOT NULL DEFAULT '',
  PRIMARY KEY (radacctid),
  UNIQUE KEY acctuniqueid (acctuniqueid),
  KEY username (username),
  KEY framedipaddress (framedipaddress),
  KEY acctsessionid (acctsessionid),
  KEY acctstarttime (acctstarttime),
  KEY acctstoptime (acctstoptime),
  KEY nasipaddress (nasipaddress)
);

CREATE TABLE IF NOT EXISTS radpostauth (
  id INT(11) NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL DEFAULT '',
  pass VARCHAR(64) NOT NULL DEFAULT '',
  reply VARCHAR(32) NOT NULL DEFAULT '',
  authdate TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY username (username(32))
);

CREATE TABLE IF NOT EXISTS app_vouchers_meta (
  id INT(11) NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL UNIQUE,
  profile_name VARCHAR(64) NOT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  batch_code VARCHAR(32) DEFAULT NULL,
  status ENUM('unused', 'active', 'expired') DEFAULT 'unused',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS app_operators (
  id INT(11) NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role ENUM('admin', 'operator') NOT NULL DEFAULT 'operator',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
EOF

# 3. radius-api/.env.example
cat << 'EOF' > radius-api/.env.example
PORT=3030
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=radius
DB_PASS=ganti_password_db
DB_NAME=radius_db
API_SECRET_KEY=ganti_api_secret_key
JWT_SECRET=ganti_jwt_secret_key
JWT_EXPIRES_IN=12h
DEFAULT_ADMIN_USER=admin
DEFAULT_ADMIN_PASS=AdminHotspot123!
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TG_POLL_INTERVAL_SEC=10
TG_NAS_PING_INTERVAL_SEC=60
EOF

# 4. radius-api/package.json
cat << 'EOF' > radius-api/package.json
{
  "name": "freeradius-hotspot-api",
  "version": "1.2.0",
  "description": "Backend REST API Manajemen FreeRADIUS Hotspot dengan JWT, RBAC & Notifikasi Telegram",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "bcrypt": "^5.1.1",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2",
    "mysql2": "^3.11.0"
  }
}
EOF

# 5. radius-api/telegramNotifier.js
cat << 'EOF' > radius-api/telegramNotifier.js
const { exec } = require('child_process');

class TelegramNotifier {
  constructor(pool, config = {}) {
    this.pool = pool;
    this.botToken = (config.botToken || process.env.TELEGRAM_BOT_TOKEN || '').trim();
    this.chatId = (config.chatId || process.env.TELEGRAM_CHAT_ID || '').trim();
    this.pollIntervalMs = Math.max(5, Number(config.pollIntervalSec || process.env.TG_POLL_INTERVAL_SEC || 10)) * 1000;
    this.nasPingIntervalMs = Math.max(15, Number(config.nasPingIntervalSec || process.env.TG_NAS_PING_INTERVAL_SEC || 60)) * 1000;

    this.enabled = Boolean(this.botToken && this.chatId);
    this.lastAcctId = 0;
    this.notifiedStopIds = new Set();
    this.nasStatusMap = new Map();
    this.pollTimer = null;
    this.nasTimer = null;
    this.isPolling = false;
  }

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  formatBytes(bytes) {
    const num = Number(bytes) || 0;
    if (num <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const idx = Math.floor(Math.log(num) / Math.log(1024));
    return `${parseFloat((num / Math.pow(1024, idx)).toFixed(2))} ${units[idx]}`;
  }

  formatDuration(seconds) {
    const sec = Math.max(0, Number(seconds) || 0);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h}j ${m}m ${s}d`;
  }

  async sendMessage(htmlText) {
    if (!this.enabled) return false;
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: htmlText,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        console.error('[TelegramNotifier] Gagal mengirim pesan:', data.description || response.status);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[TelegramNotifier] Error jaringan Telegram:', err.message);
      return false;
    }
  }

  async initBaseline() {
    if (!this.enabled) return;
    try {
      const [rows] = await this.pool.query('SELECT COALESCE(MAX(radacctid), 0) AS max_id FROM radacct');
      this.lastAcctId = Number(rows[0]?.max_id || 0);

      const [stoppedRows] = await this.pool.query(
        'SELECT radacctid FROM radacct WHERE radacctid <= ? AND acctstoptime IS NOT NULL',
        [this.lastAcctId]
      );
      stoppedRows.forEach(r => this.notifiedStopIds.add(Number(r.radacctid)));

      const [nasRows] = await this.pool.query('SELECT nasname, shortname FROM nas');
      for (const nas of nasRows) {
        const isUp = await this.pingHost(nas.nasname);
        this.nasStatusMap.set(nas.nasname, isUp ? 'UP' : 'DOWN');
      }
    } catch (err) {
      console.error('[TelegramNotifier] Gagal inisialisasi baseline:', err.message);
    }
  }

  pingHost(ip) {
    return new Promise((resolve) => {
      exec(`ping -c 1 -W 2 ${ip}`, (error) => resolve(!error));
    });
  }

  async checkSessions() {
    if (!this.enabled || this.isPolling) return;
    this.isPolling = true;
    try {
      const [newSessions] = await this.pool.query(
        `SELECT radacctid, username, nasipaddress, framedipaddress, callingstationid, acctstarttime, acctstoptime
         FROM radacct WHERE radacctid > ? ORDER BY radacctid ASC LIMIT 50`,
        [this.lastAcctId]
      );
      for (const s of newSessions) {
        this.lastAcctId = Number(s.radacctid);
        await this.sendMessage([
          '🟢 <b>HOTSPOT LOGIN</b>',
          `• <b>User:</b> <code>${this.escapeHtml(s.username)}</code>`,
          `• <b>IP Client:</b> <code>${this.escapeHtml(s.framedipaddress || '-')}</code>`,
          `• <b>MAC:</b> <code>${this.escapeHtml(s.callingstationid || '-')}</code>`,
          `• <b>NAS:</b> <code>${this.escapeHtml(s.nasipaddress || '-')}</code>`,
          `• <b>Waktu:</b> ${this.escapeHtml(s.acctstarttime ? new Date(s.acctstarttime).toLocaleString('id-ID') : '-')}`
        ].join('\n'));
        if (s.acctstoptime) this.notifiedStopIds.add(Number(s.radacctid));
      }

      const [stoppedSessions] = await this.pool.query(
        `SELECT radacctid, username, nasipaddress, framedipaddress, acctsessiontime,
                acctinputoctets, acctoutputoctets, acctterminatecause
         FROM radacct WHERE acctstoptime IS NOT NULL AND radacctid > GREATEST(0, ? - 500)
         ORDER BY radacctid ASC LIMIT 50`,
        [this.lastAcctId]
      );
      for (const s of stoppedSessions) {
        const id = Number(s.radacctid);
        if (this.notifiedStopIds.has(id)) continue;
        this.notifiedStopIds.add(id);
        if (this.notifiedStopIds.size > 2000) {
          const first = this.notifiedStopIds.values().next().value;
          this.notifiedStopIds.delete(first);
        }
        await this.sendMessage([
          '🔴 <b>HOTSPOT LOGOUT</b>',
          `• <b>User:</b> <code>${this.escapeHtml(s.username)}</code>`,
          `• <b>IP Client:</b> <code>${this.escapeHtml(s.framedipaddress || '-')}</code>`,
          `• <b>NAS:</b> <code>${this.escapeHtml(s.nasipaddress || '-')}</code>`,
          `• <b>Durasi:</b> ${this.escapeHtml(this.formatDuration(s.acctsessiontime))}`,
          `• <b>Pemakaian:</b> ↓ ${this.formatBytes(s.acctoutputoctets)} / ↑ ${this.formatBytes(s.acctinputoctets)}`,
          `• <b>Alasan:</b> <code>${this.escapeHtml(s.acctterminatecause || '-')}</code>`
        ].join('\n'));
      }
    } catch (err) {
      console.error('[TelegramNotifier] Gagal cek sesi:', err.message);
    } finally {
      this.isPolling = false;
    }
  }

  async checkNasStatus() {
    if (!this.enabled) return;
    try {
      const [nasList] = await this.pool.query('SELECT nasname, shortname, description FROM nas');
      const activeIps = new Set(nasList.map(n => n.nasname));
      for (const key of this.nasStatusMap.keys()) {
        if (!activeIps.has(key)) this.nasStatusMap.delete(key);
      }
      for (const nas of nasList) {
        const isUp = await this.pingHost(nas.nasname);
        const currentStatus = isUp ? 'UP' : 'DOWN';
        const prevStatus = this.nasStatusMap.get(nas.nasname);
        if (prevStatus && prevStatus !== currentStatus) {
          const label = nas.shortname || nas.nasname;
          await this.sendMessage(isUp
            ? [
                '📡 <b>ROUTER NAS ONLINE (UP)</b>',
                `• <b>Router:</b> <b>${this.escapeHtml(label)}</b>`,
                `• <b>IP NAS:</b> <code>${this.escapeHtml(nas.nasname)}</code>`,
                `• <b>Keterangan:</b> ${this.escapeHtml(nas.description || '-')}`
              ].join('\n')
            : [
                '⚠️ <b>ROUTER NAS OFFLINE (DOWN)</b>',
                `• <b>Router:</b> <b>${this.escapeHtml(label)}</b>`,
                `• <b>IP NAS:</b> <code>${this.escapeHtml(nas.nasname)}</code>`,
                `• <b>Keterangan:</b> ${this.escapeHtml(nas.description || '-')}`
              ].join('\n'));
        }
        this.nasStatusMap.set(nas.nasname, currentStatus);
      }
    } catch (err) {
      console.error('[TelegramNotifier] Gagal cek status NAS:', err.message);
    }
  }

  async start() {
    if (!this.enabled) {
      console.log('[TelegramNotifier] Nonaktif.');
      return;
    }
    await this.initBaseline();
    await this.sendMessage('🤖 <b>FreeRADIUS Hotspot Notifier Aktif</b>');
    this.pollTimer = setInterval(() => this.checkSessions(), this.pollIntervalMs);
    this.nasTimer = setInterval(() => this.checkNasStatus(), this.nasPingIntervalMs);
  }

  stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.nasTimer) clearInterval(this.nasTimer);
  }
}

module.exports = TelegramNotifier;
EOF

# 6. radius-api/server.js
cat << 'EOF' > radius-api/server.js
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { exec } = require('child_process');
const TelegramNotifier = require('./telegramNotifier');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_jwt_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

const notifier = new TelegramNotifier(pool);

async function ensureDefaultAdmin() {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS total FROM app_operators');
    if (rows[0].total === 0) {
      const adminUser = process.env.DEFAULT_ADMIN_USER || 'admin';
      const adminPass = process.env.DEFAULT_ADMIN_PASS || 'AdminHotspot123!';
      const hash = await bcrypt.hash(adminPass, 10);
      await pool.query(
        'INSERT INTO app_operators (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
        [adminUser, hash, 'Administrator Utama', 'admin']
      );
      console.log(`Akun admin awal dibuat -> username: "${adminUser}"`);
    }
  } catch (err) {
    console.error('Gagal memeriksa/membuat admin awal:', err.message);
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const apiKey = req.headers['x-api-key'];

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Token JWT tidak valid atau sudah kadaluarsa' });
    }
  }

  if (apiKey && process.env.API_SECRET_KEY && apiKey === process.env.API_SECRET_KEY) {
    req.user = { id: 0, username: 'api-key-client', fullName: 'API Client', role: 'admin' };
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Silakan login terlebih dahulu' });
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Akses khusus role ' + allowedRoles.join('/') });
    }
    next();
  };
}

function generateCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib diisi' });
  try {
    const [rows] = await pool.query(
      'SELECT id, username, password_hash, full_name, role, is_active FROM app_operators WHERE username = ? LIMIT 1',
      [username.trim()]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Username atau password salah' });
    const user = rows[0];
    if (!user.is_active) return res.status(403).json({ error: 'Akun operator dinonaktifkan' });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Username atau password salah' });
    const payload = { id: user.id, username: user.username, fullName: user.full_name, role: user.role };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({ success: true, token, user: payload });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => res.json({ success: true, user: req.user }));

app.get('/api/operators', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, username, full_name, role, is_active, created_at FROM app_operators ORDER BY id ASC');
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/operators', authMiddleware, requireRole('admin'), async (req, res) => {
  const { username, password, fullName, role = 'operator' } = req.body;
  if (!username || !password || !fullName) return res.status(400).json({ error: 'Username, password, dan nama lengkap wajib diisi' });
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO app_operators (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)', [username.trim(), hash, fullName.trim(), role]);
    res.json({ success: true, message: `Akun ${username} (${role}) berhasil dibuat` });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username sudah digunakan' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/operators/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const targetId = Number(req.params.id);
  if (req.user.id === targetId) return res.status(400).json({ error: 'Tidak dapat menghapus akun sendiri' });
  try {
    await pool.query('DELETE FROM app_operators WHERE id = ?', [targetId]);
    res.json({ success: true, message: 'Akun operator dihapus' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/profiles', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT groupname, attribute, value FROM radgroupreply ORDER BY groupname');
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/profiles', authMiddleware, requireRole('admin'), async (req, res) => {
  const { name, rateLimit, sessionTimeout, maxAllSession, dataLimitBytes } = req.body;
  if (!name) return res.status(400).json({ error: 'Nama profil wajib diisi' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM radgroupreply WHERE groupname = ?', [name]);
    const attributes = [];
    if (rateLimit) attributes.push([name, 'Mikrotik-Rate-Limit', ':=', rateLimit]);
    if (sessionTimeout) attributes.push([name, 'Session-Timeout', ':=', String(sessionTimeout)]);
    if (maxAllSession) attributes.push([name, 'Max-All-Session', ':=', String(maxAllSession)]);
    if (dataLimitBytes) attributes.push([name, 'Mikrotik-Total-Limit', ':=', String(dataLimitBytes)]);
    if (attributes.length > 0) await conn.query('INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES ?', [attributes]);
    await conn.commit();
    res.json({ success: true, message: `Profil ${name} berhasil disimpan` });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally { conn.release(); }
});

app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT rc.username, rc.value AS password, rug.groupname AS profile,
             meta.price, meta.batch_code, meta.status, meta.created_at
      FROM radcheck rc
      LEFT JOIN radusergroup rug ON rc.username = rug.username
      LEFT JOIN app_vouchers_meta meta ON rc.username = meta.username
      WHERE rc.attribute = 'Cleartext-Password'
      ORDER BY meta.created_at DESC, rc.id DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/vouchers/generate', authMiddleware, requireRole('admin', 'operator'), async (req, res) => {
  const { count = 10, prefix = 'VC-', length = 5, profile, price = 0, sameUserPass = true } = req.body;
  if (!profile) return res.status(400).json({ error: 'Profil paket harus dipilih' });
  const batchCode = `BATCH-${Date.now().toString().slice(-6)}`;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const radcheckValues = [], radusergroupValues = [], metaValues = [], createdList = [];
    for (let i = 0; i < count; i++) {
      const code = `${prefix}${generateCode(length)}`;
      const password = sameUserPass ? code : generateCode(length);
      radcheckValues.push([code, 'Cleartext-Password', ':=', password]);
      radusergroupValues.push([code, profile, 1]);
      metaValues.push([code, profile, price, batchCode, 'unused']);
      createdList.push({ username: code, password, profile, price, batchCode });
    }
    await conn.query('INSERT INTO radcheck (username, attribute, op, value) VALUES ?', [radcheckValues]);
    await conn.query('INSERT INTO radusergroup (username, groupname, priority) VALUES ?', [radusergroupValues]);
    await conn.query('INSERT INTO app_vouchers_meta (username, profile_name, price, batch_code, status) VALUES ?', [metaValues]);
    await conn.commit();
    res.json({ success: true, batchCode, count: createdList.length, vouchers: createdList });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally { conn.release(); }
});

app.delete('/api/users/:username', authMiddleware, requireRole('admin'), async (req, res) => {
  const { username } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM radcheck WHERE username = ?', [username]);
    await conn.query('DELETE FROM radreply WHERE username = ?', [username]);
    await conn.query('DELETE FROM radusergroup WHERE username = ?', [username]);
    await conn.query('DELETE FROM app_vouchers_meta WHERE username = ?', [username]);
    await conn.commit();
    res.json({ success: true, message: `User ${username} dihapus` });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally { conn.release(); }
});

app.get('/api/nas', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM nas ORDER BY id DESC');
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/nas', authMiddleware, requireRole('admin'), async (req, res) => {
  const { nasname, shortname, secret, description } = req.body;
  if (!nasname || !secret) return res.status(400).json({ error: 'IP Address (nasname) dan Secret wajib diisi' });
  try {
    await pool.query('INSERT INTO nas (nasname, shortname, type, secret, description) VALUES (?, ?, ?, ?, ?)', [nasname, shortname || nasname, 'other', secret, description || 'MikroTik Hotspot']);
    res.json({ success: true, message: 'Router NAS berhasil ditambahkan' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sessions/active', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT radacctid, acctsessionid, username, nasipaddress,
             framedipaddress AS ip_address, callingstationid AS mac_address,
             acctstarttime AS start_time, acctsessiontime AS uptime_seconds,
             acctinputoctets AS upload_bytes, acctoutputoctets AS download_bytes
      FROM radacct WHERE acctstoptime IS NULL ORDER BY acctstarttime DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/logs/auth', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, username, reply, authdate FROM radpostauth ORDER BY id DESC LIMIT 100');
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sessions/disconnect', authMiddleware, requireRole('admin', 'operator'), async (req, res) => {
  const { username, nasipaddress, acctsessionid } = req.body;
  try {
    const [nasRows] = await pool.query('SELECT secret FROM nas WHERE nasname = ?', [nasipaddress]);
    if (nasRows.length === 0) return res.status(404).json({ error: 'NAS tidak ditemukan di database' });
    const secret = nasRows[0].secret;
    const cmd = `echo "User-Name=${username},Acct-Session-Id=${acctsessionid}" | radclient -x ${nasipaddress}:3799 disconnect ${secret}`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) return res.status(500).json({ error: 'Gagal mengirim paket CoA Disconnect', detail: stderr || error.message });
      res.json({ success: true, message: `Sesi ${username} berhasil diputus`, output: stdout });
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/notifications/test', authMiddleware, requireRole('admin'), async (req, res) => {
  if (!notifier.enabled) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN atau TELEGRAM_CHAT_ID belum diatur di .env' });
  const ok = await notifier.sendMessage('🧪 <b>Tes Notifikasi FreeRADIUS</b>\nKoneksi bot Telegram dari backend Node.js berhasil.');
  if (!ok) return res.status(502).json({ error: 'Gagal mengirim pesan uji ke Telegram' });
  res.json({ success: true, message: 'Pesan uji berhasil dikirim ke Telegram' });
});

const PORT = process.env.PORT || 3030;
ensureDefaultAdmin().then(async () => {
  await notifier.start();
  app.listen(PORT, () => console.log(`RADIUS Management API berjalan di port ${PORT}`));
});
EOF

# 7. public/index.html
cat << 'EOF' > public/index.html
<!DOCTYPE html>
<html lang="id" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FreeRADIUS Hotspot Core — Manager</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: { extend: { colors: { cyber: { bg: '#090d16', card: '#111827', cyan: '#00ffcc' } } } }
    };
  </script>
  <style>
    body { background-color: #090d16; color: #e5e7eb; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
    .neon-border { border: 1px solid rgba(0, 255, 204, 0.35); box-shadow: 0 0 20px rgba(0, 255, 204, 0.08); }
    @media print {
      body * { visibility: hidden; }
      #print-area, #print-area * { visibility: visible; }
      #print-area { position: absolute; left: 0; top: 0; width: 100%; background: #ffffff !important; color: #000000 !important; }
    }
  </style>
</head>
<body class="min-h-screen flex flex-col">
  <div id="toast-container" class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"></div>

  <div id="login-view" class="min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-md bg-gray-900/95 rounded-2xl p-6 md:p-8 neon-border space-y-6">
      <div class="text-center space-y-2">
        <div class="w-12 h-12 mx-auto rounded-xl bg-[#00ffcc]/10 border border-[#00ffcc]/50 flex items-center justify-center text-[#00ffcc] font-bold text-lg">R3</div>
        <h1 class="text-xl font-bold text-white">FreeRADIUS Hotspot Core</h1>
        <p class="text-xs text-gray-400">Masuk menggunakan akun Admin atau Operator</p>
      </div>
      <form onsubmit="handleLogin(event)" class="space-y-4">
        <div>
          <label class="block text-xs text-gray-400 mb-1">Base URL API</label>
          <input type="text" id="login-api-url" value="/api" required class="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-[#00ffcc] focus:outline-none" />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Username</label>
          <input type="text" id="login-username" placeholder="admin" required class="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-[#00ffcc] focus:outline-none" />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Password</label>
          <input type="password" id="login-password" placeholder="••••••••" required class="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-[#00ffcc] focus:outline-none" />
        </div>
        <button type="submit" class="w-full py-2.5 rounded-lg bg-[#00ffcc] hover:bg-emerald-300 text-gray-950 font-semibold text-sm transition">Masuk ke Dashboard</button>
      </form>
    </div>
  </div>

  <div id="app-view" class="hidden min-h-screen flex-col">
    <header class="border-b border-gray-800 bg-gray-950/90 backdrop-blur sticky top-0 z-30">
      <div class="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-emerald-500/10 border border-[#00ffcc]/50 flex items-center justify-center text-[#00ffcc] font-bold">R3</div>
          <div>
            <h1 class="text-base md:text-lg font-bold text-white flex items-center gap-2">
              FreeRADIUS Hotspot Core
              <span id="role-badge" class="text-xs px-2 py-0.5 rounded-full bg-[#00ffcc]/15 text-[#00ffcc] border border-[#00ffcc]/40 uppercase">role</span>
            </h1>
            <p class="text-xs text-gray-400">Login sebagai: <strong id="current-user-label" class="text-gray-200">-</strong></p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="refreshAllData()" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700">↻ Muat Ulang</button>
          <button onclick="handleLogout()" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40">Keluar</button>
        </div>
      </div>
    </header>

    <main class="max-w-7xl w-full mx-auto px-4 py-6 flex-1 space-y-6">
      <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-gray-900/90 rounded-xl p-4 neon-border">
          <p class="text-xs uppercase text-gray-400">User Online</p>
          <p id="stat-online" class="text-2xl font-bold text-[#00ffcc] mt-1">0</p>
        </div>
        <div class="bg-gray-900/90 rounded-xl p-4 border border-gray-800">
          <p class="text-xs uppercase text-gray-400">Total User / Voucher</p