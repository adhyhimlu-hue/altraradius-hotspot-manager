# altraRADIUS Hotspot Core — Manager

Sistem manajemen **FreeRADIUS 3** berbasis web untuk pengelolaan voucher hotspot MikroTik, profil bandwidth/kuota, pemantauan sesi aktif (*accounting*), pemutusan sesi jarak jauh (*CoA Disconnect*), serta notifikasi otomatis ke bot Telegram.

---

## Fitur Utama

* **Autentikasi & Hak Akses Berbasis Role (JWT & RBAC)**:
  * **Admin**: Akses penuh ke manajemen profil paket, router NAS, akun operator, voucher, sesi aktif, dan tes notifikasi Telegram.
  * **Operator**: Pembuatan voucher massal, pemantauan sesi aktif, log autentikasi, dan ekspor/cetak voucher.
  * Mendukung autentikasi menggunakan **Bearer Token (JWT)** maupun header **`x-api-key`** untuk integrasi sistem eksternal.
* **Generator Voucher Massal & Cetak**:
  * Generate ratusan kode voucher sekaligus dengan *prefix*, panjang kode, harga, dan opsi *username = password* atau acak terpisah.
  * Ekspor data voucher ke format **CSV** serta tampilan **Cetak Voucher** siap print.
* **Manajemen Profil Paket RADIUS (`radgroupreply`)**:
  * Mendukung atribut MikroTik dan standar RADIUS: `Mikrotik-Rate-Limit`, `Session-Timeout`, `Max-All-Session`, dan `Mikrotik-Total-Limit`.
* **Pemantauan Sesi Aktif & CoA Disconnect**:
  * Menampilkan daftar pengguna online beserta alamat IP, MAC Address, durasi koneksi, dan pemakaian *download/upload* dari tabel `radacct`.
  * Pemutusan paksa koneksi pengguna langsung ke router MikroTik menggunakan `radclient` pada port UDP `3799`.
* **Notifikasi Real-Time Bot Telegram**:
  * Notifikasi otomatis saat pengguna **Hotspot Login** dan **Hotspot Logout** (lengkap dengan durasi, total kuota terpakai, dan alasan putus).
  * Pemantauan status koneksi router **NAS (UP / DOWN)** secara berkala melalui ICMP ping.

---

## Struktur Direktori

```text
freeradius-hotspot-repo/
├── .gitignore
├── install.sh                      # Skrip instalasi otomatis aplikasi & database
├── schema.sql                      # Skema database MariaDB/MySQL (radius_db)
├── public/
│   └── index.html                  # Antarmuka Web Dashboard (Tailwind CSS)
└── radius-api/
    ├── .env.example                # Template konfigurasi environment
    ├── package.json                # Dependensi Node.js
    ├── server.js                   # Backend REST API Express.js
    └── telegramNotifier.js         # Modul worker notifikasi bot Telegram
```

---

## Kebutuhan Sistem & Perangkat

### 1. Perangkat Keras & Sistem Operasi
* **Sistem Operasi**: Linux berbasis Debian/Ubuntu seperti Debian 11/12, Ubuntu 20.04/22.04/24.04, atau Armbian (arsitektur `arm64`/`aarch64` maupun `x86_64`/`i386`).
* **Spesifikasi Minimum Server**: RAM minimal 512 MB–1 GB (disarankan 1 GB+ bila menjalankan FreeRADIUS, MariaDB, dan Node.js sekaligus di satu perangkat), ruang penyimpanan minimal 2 GB kosong, serta koneksi jaringan stabil ke router MikroTik.

### 2. Paket & Layanan Perangkat Lunak
* **Node.js (v18+)** & **npm** — menjalankan REST API backend (`server.js` dan `telegramNotifier.js`).
* **PM2** (`npm install -g pm2`) — menjaga proses Node.js tetap berjalan di latar belakang dan aktif otomatis saat *reboot*.
* **MariaDB / MySQL Server** (`mariadb-server` atau `mysql-server`) — menyimpan data RADIUS, voucher, operator, dan log sesi.
* **FreeRADIUS 3** (`freeradius`, `freeradius-mysql`, `freeradius-utils`) — server autentikasi/akuntansi RADIUS serta utilitas `radclient` untuk *CoA Disconnect*.
* **Utilitas Pendukung**: `openssl`, `curl`, `git`, serta akses `sudo` untuk konfigurasi database dan layanan sistem.

### 3. Kebutuhan Jaringan & Konfigurasi Eksternal
* **Port Server RADIUS & Aplikasi**:
  * `1812/udp` — RADIUS Authentication
  * `1813/udp` — RADIUS Accounting
  * `3799/udp` — RADIUS CoA / Disconnect (`radclient`)
  * `3030/tcp` — Akses Web Dashboard & REST API
* **Router MikroTik**: Sudah dikonfigurasi Hotspot/RADIUS client dengan akses jaringan ke server FreeRADIUS.
* **Bot Telegram (Opsional)**: *Bot Token* dari `@BotFather` dan *Chat ID* tujuan untuk notifikasi login/logout serta status router NAS.

---

## Tahapan Instalasi Lengkap

### Tahap 1: Persiapan OS & Paket Pendukung
Perbarui daftar paket dan pasang MariaDB, FreeRADIUS 3 beserta modul MySQL/utils, serta Node.js v20 LTS dan PM2:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl openssl mariadb-server freeradius freeradius-mysql freeradius-utils

# Instal Node.js v20 LTS dan PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
node -v
```

---

### Tahap 2: Unduh Repositori & Jalankan Skrip Instalasi
Clone repositori ke server, beri izin eksekusi pada `install.sh`, lalu jalankan:

```bash
git clone https://github.com/USERNAME_GITHUB/NAMA_REPO.git ~/freeradius-hotspot-src
cd ~/freeradius-hotspot-src
chmod +x install.sh
./install.sh
```

Selama proses ini berjalan, `install.sh` akan melakukan tindakan berikut secara otomatis:
1. Menyalin struktur proyek (`schema.sql`, `public/index.html`, dan seluruh isi `radius-api/`) ke direktori `~/freeradius-hotspot`.
2. Membuat file `~/freeradius-hotspot/radius-api/.env` lengkap dengan *password* database acak, `API_SECRET_KEY`, dan `JWT_SECRET`.
3. Menginstal seluruh dependensi Node.js (`express`, `mysql2`, `jsonwebtoken`, `bcrypt`, `cors`, `dotenv`).
4. Membuat database `radius_db`, mengimpor tabel dari `schema.sql`, serta membuat user database `radius` dengan hak akses penuh ke `radius_db`.

> **Penting:** Simpan kredensial (**DB Pass**, **Admin: `admin`**, dan **Pass Awal: `AdminHotspot123!`**) yang tampil di akhir output `./install.sh`. Segera ganti password admin setelah login pertama kali.

---

### Tahap 3: Hubungkan FreeRADIUS 3 ke Database MariaDB
1. Aktifkan modul SQL pada FreeRADIUS 3:
   ```bash
   sudo ln -sf /etc/freeradius/3.0/mods-available/sql /etc/freeradius/3.0/mods-enabled/sql
   ```
2. Buka file konfigurasi modul SQL:
   ```bash
   sudo nano /etc/freeradius/3.0/mods-enabled/sql
   ```
   Sesuaikan bagian koneksi database dengan nilai `DB_PASS` yang ada di `~/freeradius-hotspot/radius-api/.env`:
   ```text
   driver = "rlm_sql_mysql"
   dialect = "mysql"
   server = "127.0.0.1"
   port = 3306
   login = "radius"
   password = "ISI_DB_PASS_DARI_ENV"
   radius_db = "radius_db"
   read_clients = yes
   ```
   *(Pastikan tanda `#` pada `read_clients = yes` dihapus agar tabel `nas` dibaca otomatis oleh FreeRADIUS).*
3. Uji konfigurasi FreeRADIUS sebelum menjalankan daemon:
   ```bash
   sudo freeradius -X
   ```
   Pastikan tidak ada pesan `error` (tekan `Ctrl + C` untuk keluar setelah pengujian berhasil).

---

### Tahap 4: Atur Notifikasi Telegram (Opsional)
Jika ingin mengaktifkan notifikasi otomatis login/logout pengguna dan status router NAS:

```bash
nano ~/freeradius-hotspot/radius-api/.env
```

Isi variabel berikut:
```env
PORT=3030
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
TELEGRAM_CHAT_ID=-1001234567890
TG_POLL_INTERVAL_SEC=10
TG_NAS_PING_INTERVAL_SEC=60
```

---

### Tahap 5: Jalankan Layanan & Autostart Saat Boot (`systemd` + PM2)
1. Pastikan `freeradius` selalu menyala setelah `mariadb` siap saat *booting*:
   ```bash
   sudo mkdir -p /etc/systemd/system/freeradius.service.d
   sudo tee /etc/systemd/system/freeradius.service.d/after-mariadb.conf << 'EOF'
   [Unit]
   After=network-online.target mariadb.service
   Wants=network-online.target
   Requires=mariadb.service
   EOF

   sudo systemctl daemon-reload
   sudo systemctl enable --now mariadb freeradius
   ```
2. Jalankan backend Node.js menggunakan PM2 dan aktifkan *startup* sistem:
   ```bash
   cd ~/freeradius-hotspot/radius-api
   pm2 start server.js --name "radius-api" --update-env
   pm2 save
   pm2 startup
   ```
   *(Salin dan jalankan perintah `sudo env PATH=...` yang ditampilkan oleh output `pm2 startup` agar PM2 berjalan otomatis saat server menyala ulang).*

---

### Tahap 6: Konfigurasi Firewall & Integrasi MikroTik
1. Izinkan port yang diperlukan di firewall (`ufw`):
   ```bash
   sudo ufw allow 1812/udp
   sudo ufw allow 1813/udp
   sudo ufw allow 3799/udp
   sudo ufw allow 3030/tcp
   ```
2. Buka dashboard di `http://IP_SERVER_RADIUS:3030`, login dengan akun `admin` (`AdminHotspot123!`), lalu tambahkan data router MikroTik pada menu **Router NAS**.
3. Muat ulang FreeRADIUS agar klien NAS baru terbaca:
   ```bash
   sudo systemctl reload freeradius
   ```
4. Pada router **MikroTik**, hubungkan ke server RADIUS melalui Terminal/Winbox:
   ```rsc
   /radius add service=hotspot address=IP_SERVER_RADIUS secret=SHARED_SECRET authentication-port=1812 accounting-port=1813
   /radius incoming set accept=yes port=3799
   /ip hotspot profile set [find] use-radius=yes
   ```

---

## Verifikasi Instalasi
* **Cek status layanan FreeRADIUS & MariaDB**:
  ```bash
  sudo systemctl status freeradius mariadb --no-pager
  ```
* **Cek status proses REST API**:
  ```bash
  pm2 status
  pm2 logs radius-api --lines 20
  ```
* **Akses Web Dashboard**: Buka browser ke `http://IP_SERVER_RADIUS:3030`.
