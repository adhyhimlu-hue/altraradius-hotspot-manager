require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { exec } = require('child_process');
const TelegramNotifier = require('./telegramNotifier');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const PUBLIC_DIR = path.join(__dirname, '../public');
const BRANDING_FILE_PATH = path.join(PUBLIC_DIR, 'branding.json');
const VOUCHER_TEMPLATE_PATH = path.join(PUBLIC_DIR, 'voucher-template.json');
app.use(express.static(PUBLIC_DIR));

const ENV_FILE_PATH = path.join(__dirname, '.env');
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_jwt_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

const DEFAULT_BRANDING = {
  brandMain: 'altra',
  brandAccent: 'RADIUS',
  logoText: 'aR',
  logoUrl: '',
  voucherTitle: 'VOUCHER altraRADIUS'
};

const DEFAULT_VOUCHER_TEMPLATE = {
  columns: 4,
  cardPaddingPx: 8,
  borderStyle: 'dashed',
  borderColor: '#333333',
  accentColor: '#0f172a',
  showLogo: true,
  showTitle: true,
  showPasswordMode: 'different',
  showProfile: true,
  showPrice: true,
  showBatch: false,
  showComment: true,
  footerNote: 'Login di halaman Hotspot / Captive Portal'
};

function readBranding() {
  try {
    if (fs.existsSync(BRANDING_FILE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(BRANDING_FILE_PATH, 'utf8'));
      return { ...DEFAULT_BRANDING, ...raw };
    }
  } catch (err) {
    console.error('Gagal membaca branding.json:', err.message);
  }
  return { ...DEFAULT_BRANDING };
}

function writeBranding(data) {
  const merged = { ...DEFAULT_BRANDING, ...data };
  fs.writeFileSync(BRANDING_FILE_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function readVoucherTemplate() {
  try {
    if (fs.existsSync(VOUCHER_TEMPLATE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(VOUCHER_TEMPLATE_PATH, 'utf8'));
      return { ...DEFAULT_VOUCHER_TEMPLATE, ...raw };
    }
  } catch (err) {
    console.error('Gagal membaca voucher-template.json:', err.message);
  }
  return { ...DEFAULT_VOUCHER_TEMPLATE };
}

function writeVoucherTemplate(data) {
  const allowedBorders = ['dashed', 'solid', 'dotted', 'double'];
  const allowedPassModes = ['always', 'different', 'never'];
  const cols = Math.min(6, Math.max(1, Number(data.columns) || DEFAULT_VOUCHER_TEMPLATE.columns));
  const pad = Math.min(24, Math.max(4, Number(data.cardPaddingPx) || DEFAULT_VOUCHER_TEMPLATE.cardPaddingPx));
  const borderStyle = allowedBorders.includes(data.borderStyle) ? data.borderStyle : DEFAULT_VOUCHER_TEMPLATE.borderStyle;
  const showPasswordMode = allowedPassModes.includes(data.showPasswordMode) ? data.showPasswordMode : DEFAULT_VOUCHER_TEMPLATE.showPasswordMode;

  const merged = {
    ...DEFAULT_VOUCHER_TEMPLATE,
    ...data,
    columns: cols,
    cardPaddingPx: pad,
    borderStyle,
    showPasswordMode,
    borderColor: typeof data.borderColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(data.borderColor.trim()) ? data.borderColor.trim() : DEFAULT_VOUCHER_TEMPLATE.borderColor,
    accentColor: typeof data.accentColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(data.accentColor.trim()) ? data.accentColor.trim() : DEFAULT_VOUCHER_TEMPLATE.accentColor,
    showLogo: typeof data.showLogo === 'boolean' ? data.showLogo : DEFAULT_VOUCHER_TEMPLATE.showLogo,
    showTitle: typeof data.showTitle === 'boolean' ? data.showTitle : DEFAULT_VOUCHER_TEMPLATE.showTitle,
    showProfile: typeof data.showProfile === 'boolean' ? data.showProfile : DEFAULT_VOUCHER_TEMPLATE.showProfile,
    showPrice: typeof data.showPrice === 'boolean' ? data.showPrice : DEFAULT_VOUCHER_TEMPLATE.showPrice,
    showBatch: typeof data.showBatch === 'boolean' ? data.showBatch : DEFAULT_VOUCHER_TEMPLATE.showBatch,
    showComment: typeof data.showComment === 'boolean' ? data.showComment : DEFAULT_VOUCHER_TEMPLATE.showComment,
    footerNote: typeof data.footerNote === 'string' ? data.footerNote.trim().slice(0, 120) : DEFAULT_VOUCHER_TEMPLATE.footerNote
  };

  fs.writeFileSync(VOUCHER_TEMPLATE_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

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

function updateEnvFile(updates) {
  let content = '';
  if (fs.existsSync(ENV_FILE_PATH)) {
    content = fs.readFileSync(ENV_FILE_PATH, 'utf8');
  }
  const lines = content ? content.split(/?
/) : [];
  const handledKeys = new Set();

  const updatedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !line.includes('=')) return line;
    const eqIdx = line.indexOf('=');
    const key = line.slice(0, eqIdx).trim();
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      handledKeys.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });

  for (const [key, val] of Object.entries(updates)) {
    if (!handledKeys.has(key)) {
      updatedLines.push(`${key}=${val}`);
    }
  }

  fs.writeFileSync(ENV_FILE_PATH, updatedLines.join('
').replace(/
*$/, '
'), 'utf8');
}

async function ensureSchemaMigrations() {
  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM app_vouchers_meta LIKE 'comment'");
    if (cols.length === 0) {
      await pool.query("ALTER TABLE app_vouchers_meta ADD COLUMN comment VARCHAR(100) DEFAULT NULL AFTER batch_code");
      console.log('Migrasi kolom app_vouchers_meta.comment berhasil.');
    }
  } catch (err) {
    console.error('Gagal memeriksa migrasi kolom comment:', err.message);
  }
}

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

app.get('/api/branding', (req, res) => {
  res.json({ success: true, data: readBranding() });
});

app.post('/api/branding', authMiddleware, requireRole('admin'), (req, res) => {
  const { brandMain, brandAccent, logoText, logoDataUrl, logoUrl, voucherTitle, resetLogo } = req.body || {};
  const current = readBranding();

  let nextLogoUrl = current.logoUrl;

  if (resetLogo) {
    try {
      fs.readdirSync(PUBLIC_DIR)
        .filter(f => f.startsWith('custom-logo.'))
        .forEach(f => fs.unlinkSync(path.join(PUBLIC_DIR, f)));
    } catch (_) {}
    nextLogoUrl = '';
  } else if (typeof logoDataUrl === 'string' && logoDataUrl.startsWith('data:image/')) {
    const match = logoDataUrl.match(/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,(.+)$/i);
    if (!match) {
      return res.status(400).json({ error: 'Format gambar harus PNG, JPG, WEBP, atau SVG' });
    }
    const rawExt = match[1].toLowerCase();
    const ext = rawExt === 'svg+xml' ? 'svg' : (rawExt === 'jpeg' ? 'jpg' : rawExt);
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 2 * 1024 * 1024) {
      return res.status(400).json({ error: 'Ukuran file logo maksimal 2 MB' });
    }
    try {
      fs.readdirSync(PUBLIC_DIR)
        .filter(f => f.startsWith('custom-logo.'))
        .forEach(f => fs.unlinkSync(path.join(PUBLIC_DIR, f)));
    } catch (_) {}
    const filename = `custom-logo.${ext}`;
    fs.writeFileSync(path.join(PUBLIC_DIR, filename), buffer);
    nextLogoUrl = `/${filename}?v=${Date.now()}`;
  } else if (typeof logoUrl === 'string') {
    nextLogoUrl = logoUrl.trim();
  }

  const saved = writeBranding({
    brandMain: typeof brandMain === 'string' && brandMain.trim() ? brandMain.trim() : current.brandMain,
    brandAccent: typeof brandAccent === 'string' ? brandAccent.trim() : current.brandAccent,
    logoText: typeof logoText === 'string' && logoText.trim() ? logoText.trim().slice(0, 4) : current.logoText,
    logoUrl: nextLogoUrl,
    voucherTitle: typeof voucherTitle === 'string' && voucherTitle.trim() ? voucherTitle.trim() : current.voucherTitle
  });

  res.json({ success: true, message: 'Logo & identitas aplikasi berhasil diperbarui', data: saved });
});

app.get('/api/voucher-template', authMiddleware, (req, res) => {
  res.json({ success: true, data: readVoucherTemplate() });
});

app.post('/api/voucher-template', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const body = req.body || {};
    if (body.reset) {
      fs.writeFileSync(VOUCHER_TEMPLATE_PATH, JSON.stringify(DEFAULT_VOUCHER_TEMPLATE, null, 2), 'utf8');
      return res.json({ success: true, message: 'Template cetak voucher dikembalikan ke bawaan', data: { ...DEFAULT_VOUCHER_TEMPLATE } });
    }
    const saved = writeVoucherTemplate(body);
    res.json({ success: true, message: 'Template cetak voucher berhasil disimpan', data: saved });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menyimpan template voucher: ' + err.message });
  }
});

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

app.put('/api/operators/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const targetId = Number(req.params.id);
  const { fullName, role, password, isActive } = req.body || {};
  if (!fullName) return res.status(400).json({ error: 'Nama lengkap wajib diisi' });
  const allowedRoles = ['admin', 'operator'];
  const nextRole = allowedRoles.includes(role) ? role : 'operator';
  const activeVal = typeof isActive === 'boolean' ? (isActive ? 1 : 0) : (Number(isActive) === 0 ? 0 : 1);

  try {
    if (password && String(password).trim().length > 0) {
      const hash = await bcrypt.hash(String(password).trim(), 10);
      await pool.query(
        'UPDATE app_operators SET full_name = ?, role = ?, password_hash = ?, is_active = ? WHERE id = ?',
        [fullName.trim(), nextRole, hash, activeVal, targetId]
      );
    } else {
      await pool.query(
        'UPDATE app_operators SET full_name = ?, role = ?, is_active = ? WHERE id = ?',
        [fullName.trim(), nextRole, activeVal, targetId]
      );
    }
    res.json({ success: true, message: 'Akun operator berhasil diperbarui' });
  } catch (err) {
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

app.delete('/api/profiles/:name', authMiddleware, requireRole('admin'), async (req, res) => {
  const groupname = decodeURIComponent(req.params.name);
  try {
    await pool.query('DELETE FROM radgroupreply WHERE groupname = ?', [groupname]);
    res.json({ success: true, message: `Profil ${groupname} berhasil dihapus` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT rc.username, rc.value AS password, rug.groupname AS profile,
             meta.price, meta.batch_code, meta.comment, meta.status, meta.created_at
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
  const { count = 10, prefix = 'VC-', length = 5, profile, price = 0, sameUserPass = true, comment = '' } = req.body;
  if (!profile) return res.status(400).json({ error: 'Profil paket harus dipilih' });
  const batchCode = `BATCH-${Date.now().toString().slice(-6)}`;
  const cleanComment = String(comment || '').trim().slice(0, 100) || null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const radcheckValues = [], radusergroupValues = [], metaValues = [], createdList = [];
    for (let i = 0; i < count; i++) {
      const code = `${prefix}${generateCode(length)}`;
      const password = sameUserPass ? code : generateCode(length);
      radcheckValues.push([code, 'Cleartext-Password', ':=', password]);
      radusergroupValues.push([code, profile, 1]);
      metaValues.push([code, profile, price, batchCode, cleanComment, 'unused']);
      createdList.push({ username: code, password, profile, price, batchCode, comment: cleanComment });
    }
    await conn.query('INSERT INTO radcheck (username, attribute, op, value) VALUES ?', [radcheckValues]);
    await conn.query('INSERT INTO radusergroup (username, groupname, priority) VALUES ?', [radusergroupValues]);
    await conn.query('INSERT INTO app_vouchers_meta (username, profile_name, price, batch_code, comment, status) VALUES ?', [metaValues]);
    await conn.commit();
    res.json({ success: true, batchCode, comment: cleanComment, count: createdList.length, vouchers: createdList });
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
      const itemComment = String(item.comment || '').trim().slice(0, 100) || null;
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
          `INSERT INTO app_vouchers_meta (username, profile_name, price, batch_code, comment, status)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE profile_name = VALUES(profile_name), price = VALUES(price), batch_code = VALUES(batch_code), comment = VALUES(comment), status = VALUES(status)`,
          [username, profile, price, itemBatch, itemComment, status]
        );
        updated++;
      } else {
        await conn.query(
          "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)",
          [username, password]
        );
        await conn.query('INSERT INTO radusergroup (username, groupname, priority) VALUES (?, ?, 1)', [username, profile]);
        await conn.query(
          'INSERT INTO app_vouchers_meta (username, profile_name, price, batch_code, comment, status) VALUES (?, ?, ?, ?, ?, ?)',
          [username, profile, price, itemBatch, itemComment, status]
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
    await pool.query('INSERT INTO nas (nasname, shortname, type, secret, description) VALUES (?, ?, ?, ?, ?)', [nasname.trim(), (shortname || nasname).trim(), 'other', secret.trim(), (description || 'MikroTik Hotspot').trim()]);
    res.json({ success: true, message: 'Router NAS berhasil ditambahkan' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/nas/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const { nasname, shortname, secret, description } = req.body || {};
  if (!nasname || !secret) return res.status(400).json({ error: 'IP Address (nasname) dan Secret wajib diisi' });
  try {
    const [result] = await pool.query(
      'UPDATE nas SET nasname = ?, shortname = ?, secret = ?, description = ? WHERE id = ?',
      [nasname.trim(), (shortname || nasname).trim(), secret.trim(), (description || 'MikroTik Hotspot').trim(), id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Router NAS tidak ditemukan' });
    res.json({ success: true, message: 'Router NAS berhasil diperbarui' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/nas/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  try {
    await pool.query('DELETE FROM nas WHERE id = ?', [id]);
    res.json({ success: true, message: 'Router NAS berhasil dihapus' });
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

app.get('/api/notifications/config', authMiddleware, requireRole('admin'), (req, res) => {
  res.json({ success: true, data: notifier.getConfigSummary() });
});

app.post('/api/notifications/config', authMiddleware, requireRole('admin'), async (req, res) => {
  const { botToken, chatId, pollIntervalSec, nasPingIntervalSec, clearToken } = req.body || {};

  const finalToken = clearToken
    ? ''
    : (typeof botToken === 'string' && botToken.trim() !== '' ? botToken.trim() : notifier.botToken);
  const finalChatId = typeof chatId === 'string' ? chatId.trim() : notifier.chatId;
  const finalPollSec = Math.max(5, Number(pollIntervalSec || notifier.pollIntervalSec || 10) || 10);
  const finalPingSec = Math.max(15, Number(nasPingIntervalSec || notifier.nasPingIntervalSec || 60) || 60);

  try {
    process.env.TELEGRAM_BOT_TOKEN = finalToken;
    process.env.TELEGRAM_CHAT_ID = finalChatId;
    process.env.TG_POLL_INTERVAL_SEC = String(finalPollSec);
    process.env.TG_NAS_PING_INTERVAL_SEC = String(finalPingSec);

    updateEnvFile({
      TELEGRAM_BOT_TOKEN: finalToken,
      TELEGRAM_CHAT_ID: finalChatId,
      TG_POLL_INTERVAL_SEC: String(finalPollSec),
      TG_NAS_PING_INTERVAL_SEC: String(finalPingSec)
    });

    await notifier.reloadConfig({
      botToken: finalToken,
      chatId: finalChatId,
      pollIntervalSec: finalPollSec,
      nasPingIntervalSec: finalPingSec
    });

    res.json({
      success: true,
      message: notifier.enabled
        ? 'Pengaturan Telegram disimpan & bot notifikasi aktif'
        : 'Pengaturan Telegram disimpan (status nonaktif karena Token/Chat ID kosong)',
      data: notifier.getConfigSummary()
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menyimpan pengaturan Telegram: ' + err.message });
  }
});

app.post('/api/notifications/test', authMiddleware, requireRole('admin'), async (req, res) => {
  if (!notifier.enabled) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN atau TELEGRAM_CHAT_ID belum diatur' });
  const ok = await notifier.sendMessage('🧪 <b>Tes Notifikasi altraRADIUS</b>
Koneksi bot Telegram dari backend Node.js berhasil.');
  if (!ok) return res.status(502).json({ error: 'Gagal mengirim pesan uji ke Telegram. Periksa kembali Bot Token & Chat ID.' });
  res.json({ success: true, message: 'Pesan uji berhasil dikirim ke Telegram' });
});

const PORT = process.env.PORT || 3030;
ensureSchemaMigrations().then(() => ensureDefaultAdmin()).then(async () => {
  await notifier.start();
  app.listen(PORT, () => console.log(`altraRADIUS Management API berjalan di port ${PORT}`));
});
