# altraRADIUS — Hotspot & PPPoE Manager

Sistem manajemen **FreeRADIUS 3** berbasis web untuk pengelolaan voucher hotspot MikroTik, profil bandwidth/kuota, pemantauan sesi aktif (*accounting*), pemutusan sesi jarak jauh (*CoA Disconnect*), impor/ekspor voucher CSV, serta notifikasi otomatis ke bot Telegram.

---

## Fitur Utama

* **Autentikasi & Hak Akses Berbasis Role (JWT & RBAC)**:
  * **Admin**: Akses penuh ke manajemen profil paket, router NAS, akun operator, voucher, sesi aktif, dan tes notifikasi Telegram.
  * **Operator**: Pembuatan & impor voucher massal, pemantauan sesi aktif, log autentikasi, dan ekspor/cetak voucher.
  * Mendukung autentikasi menggunakan **Bearer Token (JWT)** maupun header **`x-api-key`** untuk integrasi sistem eksternal.
* **Generator, Import & Export Voucher CSV**:
  * Generate ratusan kode voucher sekaligus dengan *prefix*, panjang kode, harga, dan opsi *username = password* atau acak terpisah.
  * **Import CSV**: Unggah daftar user/voucher massal dari file `.csv` (mendukung pemisah `,` dan `;` serta opsi timpa data duplikat).
  * **Ekspor CSV & Cetak**: Ekspor data voucher ke `.csv` serta tampilan **Cetak Voucher** siap print.
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
altraradius/
├── .gitignore
├── README.md
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

* **Sistem Operasi**: Debian 11/12, Ubuntu 20.04/22.04/24.04, atau Armbian (ARM64/x86_64).
* **Spesifikasi Minimum Server**: RAM minimal 512 MB–1 GB dan ruang penyimpanan kosong minimal 2 GB.
* **Paket Perangkat Lunak**:
  * **Node.js (v18+)**, **npm**, dan **PM2** (`npm install -g pm2`)
  * **MariaDB / MySQL Server** (`mariadb-server`)
  * **FreeRADIUS 3** (`freeradius`, `freeradius-mysql`, `freeradius-utils` untuk `radclient`)
  * **Utilitas Pendukung**: `git`, `curl`, `openssl`, dan akses `sudo`
* **Port Jaringan**: `1812/udp` (Auth), `1813/udp` (Acct), `3799/udp` (CoA Disconnect), dan `3030/tcp` (Web Dashboard & API).

---

## Tahapan Instalasi Lengkap

### 1. Instal Paket Dasar (Database, FreeRADIUS & Node.js)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl openssl mariadb-server freeradius freeradius-mysql freeradius-utils

# Instal Node.js v20 LTS dan PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 2. Unduh Repositori & Jalankan `install.sh`

```bash
git clone https://github.com/adhyhimlu-hue/altraradius-hotspot-manager
cd ~/altraradius-hotspot-manager
chmod +x install.sh
./install.sh
```

Skrip `install.sh` akan otomatis:
1. Menyalin file aplikasi ke `~/altraradius`.
2. Membuat file `~/altraradius/radius-api/.env` berisi *password* database, `API_SECRET_KEY`, dan `JWT_SECRET` acak.
3. Menginstal dependensi Node.js (`express`, `mysql2`, `jsonwebtoken`, `bcrypt`, `cors`, `dotenv`).
4. Membuat database `radius_db` dan mengimpor seluruh tabel dari `schema.sql`.

> **Catatan:** Catat kredensial **DB Pass**, **Admin (`admin`)**, dan **Password Awal (`AdminHotspot123!`)** yang muncul setelah instalasi selesai. Segera ganti password admin setelah login pertama kali.

### 3. Hubungkan FreeRADIUS 3 ke MariaDB

```bash
sudo ln -sf /etc/freeradius/3.0/mods-available/sql /etc/freeradius/3.0/mods-enabled/sql
sudo nano /etc/freeradius/3.0/mods-enabled/sql
```

Pastikan parameter berikut sesuai dengan isi file `~/altraradius/radius-api/.env`:
* `driver = "rlm_sql_mysql"`
* `dialect = "mysql"`
* `server = "127.0.0.1"`
* `port = 3306`
* `login = "radius"`
* `password = "<DB_PASS_DARI_ENV>"`
* `radius_db = "radius_db"`
* `read_clients = yes` *(hapus tanda `#` agar tabel `nas` dibaca otomatis)*

Uji konfigurasi FreeRADIUS:

```bash
sudo freeradius -X
```

Jika tidak ada error, tekan `Ctrl + C`.

### 4. Konfigurasi Notifikasi Telegram (Opsional)

```bash
nano ~/altraradius/radius-api/.env
```

Isi token bot dan chat ID Anda:

```env
PORT=3030
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
TELEGRAM_CHAT_ID=-1001234567890
TG_POLL_INTERVAL_SEC=10
TG_NAS_PING_INTERVAL_SEC=60
```

### 5. Jalankan Layanan & Autostart Saat Boot (`systemd` + PM2)

```bash
# 1. Dependency systemd FreeRADIUS -> MariaDB
sudo mkdir -p /etc/systemd/system/freeradius.service.d
sudo tee /etc/systemd/system/freeradius.service.d/after-mariadb.conf << 'EOF'
[Unit]
After=network-online.target mariadb.service
Wants=network-online.target
Requires=mariadb.service
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now mariadb freeradius

# 2. Jalankan Node.js API dengan PM2
cd ~/altraradius/radius-api
pm2 start server.js --name "altraradius-api" --update-env
pm2 save
pm2 startup
```

*(Jalankan perintah `sudo env PATH=...` yang ditampilkan oleh output `pm2 startup`)*.

### 6. Konfigurasi Firewall & MikroTik

1. Buka port RADIUS dan web dashboard pada server:

```bash
sudo ufw allow 1812/udp
sudo ufw allow 1813/udp
sudo ufw allow 3799/udp
sudo ufw allow 3030/tcp
```

2. Buka browser ke `http://IP_SERVER_RADIUS:3030`, login dengan akun `admin` (`AdminHotspot123!`), lalu daftarkan IP MikroTik dan *Shared Secret* melalui menu **Router NAS** → **Simpan NAS**, kemudian muat ulang FreeRADIUS (`sudo systemctl reload freeradius`).
3. Pada terminal **MikroTik**, tambahkan server RADIUS:

```rsc
/radius add service=hotspot address=IP_SERVER_RADIUS secret=SHARED_SECRET authentication-port=1812 accounting-port=1813
/radius incoming set accept=yes port=3799
/ip hotspot profile set [find] use-radius=yes
```
