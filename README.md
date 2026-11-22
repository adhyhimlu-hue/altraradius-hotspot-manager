# altraRADIUS — Hotspot & PPPoE Manager

Sistem manajemen **FreeRADIUS 3** berbasis web untuk pengelolaan voucher hotspot MikroTik, profil bandwidth/kuota, pemantauan sesi aktif (*accounting*), pemutusan sesi jarak jauh (*CoA Disconnect*), impor/ekspor voucher CSV, pengaturan notifikasi bot Telegram, kustomisasi logo & nama brand, editor template cetak voucher, serta komentar cetak dan fitur edit data langsung dari dashboard.

## Struktur Direktori

```text
altraradius/
├── .gitignore
├── README.md
├── install.sh
├── update.sh
├── schema.sql
├── public/
│   └── index.html
└── radius-api/
    ├── .env.example
    ├── package.json
    ├── server.js
    └── telegramNotifier.js
```
