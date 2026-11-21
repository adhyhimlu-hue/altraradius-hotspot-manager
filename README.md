# altraradius-hotspot-manager
# FreeRADIUS Hotspot Core — Manager

Sistem manajemen **FreeRADIUS 3** berbasis web untuk pengelolaan voucher hotspot MikroTik, profil bandwidth/kuota, pemantauan sesi aktif (*accounting*), pemutusan sesi jarak jauh (*CoA Disconnect*), serta notifikasi otomatis ke bot Telegram[cite: 5, 6, 7].

---

## Fitur Utama

* **Autentikasi & Hak Akses Berbasis Role (JWT & RBAC)**[cite: 5, 7]:
  * **Admin**: Akses penuh ke manajemen profil paket, router NAS, akun operator, voucher, sesi aktif, dan tes notifikasi Telegram[cite: 4, 5].
  * **Operator**: Pembuatan voucher massal, pemantauan sesi aktif, log autentikasi, dan ekspor/cetak voucher[cite: 4, 5].
  * Mendukung autentikasi menggunakan **Bearer Token (JWT)** maupun header **`x-api-key`** untuk integrasi sistem eksternal[cite: 5].
* **Generator Voucher Massal & Cetak**[cite: 4]:
  * Generate ratusan kode voucher sekaligus dengan *prefix*, panjang kode, harga, dan opsi *username = password* atau acak terpisah[cite: 4, 5].
  * Ekspor data voucher ke format **CSV** serta tampilan **Cetak Voucher** siap print[cite: 4].
* **Manajemen Profil Paket RADIUS (`radgroupreply`)**[cite: 3, 5]:
  * Mendukung atribut MikroTik dan standar RADIUS: `Mikrotik-Rate-Limit`, `Session-Timeout`, `Max-All-Session`, dan `Mikrotik-Total-Limit`[cite: 5].
* **Pemantauan Sesi Aktif & CoA Disconnect**[cite: 4, 5]:
  * Menampilkan daftar pengguna online beserta alamat IP, MAC Address, durasi koneksi, dan pemakaian *download/upload* dari tabel `radacct`[cite: 4, 5].
  * Pemutusan paksa koneksi pengguna langsung ke router MikroTik menggunakan `radclient` pada port UDP `3799`[cite: 5].
* **Notifikasi Real-Time Bot Telegram**[cite: 5, 6]:
  * Notifikasi otomatis saat pengguna **Hotspot Login** dan **Hotspot Logout** (lengkap dengan durasi, total kuota terpakai, dan alasan putus)[cite: 6].
  * Pemantauan status koneksi router **NAS (UP / DOWN)** secara berkala melalui ICMP ping[cite: 6].

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
