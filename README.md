[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![FreeRADIUS](https://img.shields.io/badge/FreeRADIUS-3.x-0052CC?style=flat-square)](https://freeradius.org/)
[![MariaDB](https://img.shields.io/badge/MariaDB%2FMySQL-10.x-003545?style=flat-square&logo=mariadb&logoColor=white)](https://mariadb.org/)
[![License](https://img.shields.io/badge/License-MIT-00ffcc?style=flat-square)](LICENSE)

---

# altraRADIUS — Hotspot & PPPoE Manager

Sistem manajemen **FreeRADIUS** berbasis web untuk pengelolaan voucher hotspot MikroTik, profil bandwidth/kuota, pemantauan sesi aktif (*accounting*), pemutusan sesi jarak jauh (*CoA Disconnect*), impor/ekspor voucher CSV, serta pengaturan notifikasi otomatis ke bot Telegram langsung dari dashboard.

---

## Fitur Utama

* **Autentikasi & Hak Akses Berbasis Role (JWT & RBAC)**:
  * **Admin**: Akses penuh ke manajemen profil paket, router NAS, pengaturan bot Telegram, akun operator, voucher, dan sesi aktif.
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
* **Pengaturan & Notifikasi Real-Time Bot Telegram**:
  * Tab **Telegram Bot** di dashboard (khusus Admin) untuk mengubah **Bot Token**, **Chat ID**, dan interval pengecekan secara langsung tanpa perlu mengedit `.env` secara manual.
  * Notifikasi otomatis saat pengguna **Hotspot Login** dan **Hotspot Logout** (lengkap dengan durasi, total kuota terpakai, dan alasan putus) serta status **Router NAS (UP / DOWN)**.

---

## Struktur Direktori

```text
altraradius/
├── .gitignore
├── README.md
├── install.sh                      # Skrip instalasi otomatis aplikasi, DB & modul SQL FreeRADIUS
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
  * **Node.js (v20 LTS)**, **npm**, dan **PM2** (`npm install -g pm2`)
  * **MariaDB / MySQL Server** (`mariadb-server`)
  * **FreeRADIUS 3** (`freeradius`, `freeradius-mysql`, `freeradius-utils` untuk `radclient`)
  * **Utilitas Pendukung**: `git`, `curl`, `openssl`, `unzip`, `build-essential`, `python3`, dan akses `sudo`
* **Port Jaringan**: `1812/udp` (Auth), `1813/udp` (Acct), `3799/udp` (CoA Disconnect), dan `3030/tcp` (Web Dashboard & API).

---

## Tahapan Instalasi Lengkap

### 1. Instal Paket Dasar (Database, FreeRADIUS, Kompilator & Node.js)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl openssl unzip build-essential python3 mariadb-server freeradius freeradius-mysql freeradius-utils

# Instal Node.js v20 LTS dan PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 2. Unduh Repositori & Jalankan `install.sh`

```bash
git clone https://github.com/adhyhimlu-hue/altraradius-hotspot-manager.git ~/altraradius-hotspot-manager
cd ~/altraradius-hotspot-manager
chmod +x install.sh
./install.sh
```

Skrip `install.sh` akan otomatis:
1. Menyalin file aplikasi ke `$HOME/altraradius` (misalnya `/root/altraradius` jika dijalankan sebagai `root`).
2. Membuat file `$HOME/altraradius/radius-api/.env` berisi *password* database, `API_SECRET_KEY`, dan `JWT_SECRET` acak.
3. Menginstal dependensi Node.js (`express`, `mysql2`, `jsonwebtoken`, `bcrypt`, `cors`, `dotenv`).
4. Memastikan MariaDB aktif, membuat database `radius_db` dari `schema.sql`, serta menyinkronkan *password* user `radius` (`localhost` dan `127.0.0.1`).
5. Mengaktifkan *symlink* `/etc/freeradius/3.0/mods-enabled/sql` dan menyesuaikan parameter `driver`, `dialect`, `server`, `port`, `login`, `password`, `radius_db`, dan `read_clients = yes` pada `/etc/freeradius/3.0/mods-available/sql` (dengan backup `sql.bak`).

> **Catatan:** Catat kredensial **DB Pass**, **Admin (`admin`)**, dan **Password Awal (`AdminHotspot123!`)** yang muncul setelah instalasi selesai. Segera ganti password admin setelah login pertama kali.

### 3. Uji Konfigurasi FreeRADIUS

```bash
sudo systemctl stop freeradius
sudo freeradius -X
```

Jika di bagian akhir muncul tulisan **`Ready to process requests`**, tekan `Ctrl + C`.

### 4. Jalankan Layanan & Autostart Saat Boot (`systemd` + PM2)

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

### 5. Konfigurasi Notifikasi Telegram & Router NAS dari Dashboard

1. Buka browser ke `http://IP_SERVER_RADIUS:3030` dan login dengan akun `admin` (`AdminHotspot123!`).
2. Buka tab **Telegram Bot**, masukkan **Bot Token** (dari `@BotFather`) dan **Chat ID**, klik **Simpan Konfigurasi Telegram**, lalu klik **Tes Kirim Pesan Telegram**.
3. Buka tab **Router NAS**, daftarkan IP MikroTik dan *Shared Secret*, klik **Simpan NAS**, lalu muat ulang FreeRADIUS:

```bash
sudo systemctl reload freeradius
```

4. Pada terminal **MikroTik**, tambahkan server RADIUS:

```rsc
/radius add service=hotspot address=IP_SERVER_RADIUS secret=SHARED_SECRET authentication-port=1812 accounting-port=1813
/radius incoming set accept=yes port=3799
/ip hotspot profile set [find] use-radius=yes
```
