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
app.use(express.json({ limit: '5mb' }));
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

app.post('/api/vouchers/import', authMiddleware, requireRole('admin', 'operator'), async (req, res) => {
  const { users, defaultProfile = '', overwrite = false } = req.body;
  if (!Array.isArray(users) || users.length === 0) {
    return res.status(400).json({ error: 'Data user/voucher kosong atau tidak valid' });
  }

  const batchCode = `IMP-${Date.now().toString().slice(-6)}`;
  const conn = await pool.getConnection();
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  try {
    await conn.beginTransaction();

    for (const item of users) {
      const username = String(item.username || '').trim();
      const password = String(item.password || username).trim();
      const profile = String(item.profile || defaultProfile || '').trim();
      const price = Math.max(0, Number(item.price) || 0);
      const itemBatch = String(item.batch || item.batch_code || batchCode).trim();
      const rawStatus = String(item.status || 'unused').trim().toLowerCase();
      const status = ['unused', 'active', 'expired'].includes(rawStatus) ? rawStatus : 'unused';

      if (!username || !password || !profile) {
        skipped++;
        continue;
      }

      const [existing] = await conn.query(
        "SELECT id FROM radcheck WHERE username = ? AND attribute = 'Cleartext-Password' LIMIT 1",
        [username]
      );

      if (existing.length > 0) {
        if (!overwrite) {
          skipped++;
          continue;
        }
        await conn.query(
          "UPDATE radcheck SET value = ? WHERE username = ? AND attribute = 'Cleartext-Password'",
          [password, username]
        );
        await conn.query('DELETE FROM radusergroup WHERE username = ?', [username]);
        await conn.query('INSERT INTO radusergroup (username, groupname, priority) VALUES (?, ?, 1)', [username, profile]);
        await conn.query(
          `INSERT INTO app_vouchers_meta (username, profile_name, price, batch_code, status)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE profile_name = VALUES(profile_name), price = VALUES(price), batch_code = VALUES(batch_code), status = VALUES(status)`,
          [username, profile, price, itemBatch, status]
        );
        updated++;
      } else {
        await conn.query(
          "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)",
          [username, password]
        );
        await conn.query('INSERT INTO radusergroup (username, groupname, priority) VALUES (?, ?, 1)', [username, profile]);
        await conn.query(
          'INSERT INTO app_vouchers_meta (username, profile_name, price, batch_code, status) VALUES (?, ?, ?, ?, ?)',
          [username, profile, price, itemBatch, status]
        );
        imported++;
      }
    }

    await conn.commit();
    res.json({
      success: true,
      imported,
      updated,
      skipped,
      batchCode,
      message: `Import selesai: ${imported} baru, ${updated} diperbarui, ${skipped} dilewati`
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
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
  const ok = await notifier.sendMessage('🧪 <b>Tes Notifikasi altraRADIUS</b>\nKoneksi bot Telegram dari backend Node.js berhasil.');
  if (!ok) return res.status(502).json({ error: 'Gagal mengirim pesan uji ke Telegram' });
  res.json({ success: true, message: 'Pesan uji berhasil dikirim ke Telegram' });
});

const PORT = process.env.PORT || 3030;
ensureDefaultAdmin().then(async () => {
  await notifier.start();
  app.listen(PORT, () => console.log(`altraRADIUS Management API berjalan di port ${PORT}`));
});
