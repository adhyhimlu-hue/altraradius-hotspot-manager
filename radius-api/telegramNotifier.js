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
    await this.sendMessage('🤖 <b>altraRADIUS Notifier Aktif</b>');
    this.pollTimer = setInterval(() => this.checkSessions(), this.pollIntervalMs);
    this.nasTimer = setInterval(() => this.checkNasStatus(), this.nasPingIntervalMs);
  }

  stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.nasTimer) clearInterval(this.nasTimer);
  }
}

module.exports = TelegramNotifier;
