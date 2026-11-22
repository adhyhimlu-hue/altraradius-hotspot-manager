# altraRADIUS — Hotspot & PPPoE Manager

Sistem manajemen **FreeRADIUS 3** berbasis web untuk pengelolaan voucher hotspot MikroTik, profil bandwidth/kuota, pemantauan sesi aktif (*accounting*), pemutusan sesi jarak jauh (*CoA Disconnect*), impor/ekspor voucher CSV, pengaturan notifikasi bot Telegram, serta kustomisasi logo & nama brand langsung dari dashboard.

---

## Fitur Utama

* **Autentikasi & Hak Akses Berbasis Role (JWT & RBAC)**:
  * **Admin**: Akses penuh ke manajemen profil paket, router NAS, pengaturan bot Telegram, kustomisasi logo & branding, akun operator, voucher, dan sesi aktif.
  * **Operator**: Pembuatan & impor voucher massal, pemantauan sesi aktif, log autentikasi, dan ekspor/cetak voucher.
  * Mendukung autentikasi menggunakan **Bearer Token (JWT)** maupun header **`x-api-key`** untuk integrasi sistem eksternal.
* **Generator, Import & Export Voucher CSV**:
  * Generate ratusan kode voucher sekaligus dengan *prefix*, panjang kode, harga, dan opsi *username = password* atau acak terpisah.
  * **Import CSV**: Unggah daftar user/voucher massal dari file `.csv` (mendukung pemisah `,` dan `;` serta opsi timpa data duplikat).
  * **Ekspor CSV & Cetak**: Ekspor data voucher ke `.csv` serta tampilan **Cetak Voucher** siap print lengkap dengan logo jaringan.
* **Manajemen Profil Paket RADIUS (`radgroupreply`)**:
  * Mendukung atribut MikroTik dan standar RADIUS: `Mikrotik-Rate-Limit`, `Session-Timeout`, `Max-All-Session`, dan `Mikrotik-Total-Limit`.
* **Pemantauan Sesi Aktif & CoA Disconnect**:
  * Menampilkan daftar pengguna online beserta alamat IP, MAC Address, durasi koneksi, dan pemakaian *download/upload* dari tabel `radacct`.
  * Pemutusan paksa koneksi pengguna langsung ke router MikroTik menggunakan `radclient` pada port UDP `3799`.
* **Pengaturan Bot Telegram & Kustomisasi Logo / Branding**:
  * Tab **Telegram Bot** di dashboard (khusus Admin) untuk mengubah **Bot Token**, **Chat ID**, dan interval pengecekan secara langsung tanpa mengedit `.env` secara manual.
  * Tab **Logo & Branding** di dashboard (khusus Admin) untuk mengunggah file logo (PNG/JPG/WEBP/SVG), mengubah nama jaringan, serta judul header cetak voucher.

---

## Struktur Direktori

```text
altraradius/
├── .gitignore
├── README.md
├── install.sh                      # Skrip instalasi otomatis aplikasi, DB & modul SQL FreeRADIUS
├── update.sh                       # Skrip update aplikasi tanpa menimpa .env & database
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

## Instalasi Baru & Update

### Instalasi Baru
```bash
git clone https://github.com/adhyhimlu-hue/altraradius-hotspot-manager.git ~/altraradius-hotspot-manager
cd ~/altraradius-hotspot-manager
chmod +x install.sh update.sh
./install.sh
```

### Update Instalasi yang Sudah Ada (Aman untuk `.env` & Database)
```bash
cd ~/altraradius-hotspot-manager
git pull
chmod +x update.sh
./update.sh
```
