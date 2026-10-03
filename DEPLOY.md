# Deploy ke lightech.co.id/alpha

Runbook untuk mengganti versi yang sekarang ada di `lightech.co.id/alpha` dengan Lightech Mentoring App. Estimasi waktu: **±20 menit**. Setiap langkah punya titik cek, dan ada jalur rollback.

## Ringkasan arsitektur

```
Browser ──► lightech.co.id/alpha/            (file statis: index.html + assets/)
              └─ assets/config.js → apiUrl ──► Google Apps Script Web App (server/Code.gs)
                                                  └─ Google Sheet: tab "docs" (data) + "audit" (log)
```

- Login, pemisahan data antar company, dan audit log dicek di **server** (Apps Script). Password tidak pernah dikirim ke browser.
- Pola backend sama dengan aplikasi presensi (Apps Script + Sheets), jadi tim sudah familiar.

---

## Langkah 1 — Backend (10 menit)

1. Buat Google Sheet baru di Drive perusahaan, mis. **"Lightech Mentoring App — Data"**. Akses: hanya tim IT/owner.
2. Di Sheet: **Extensions → Apps Script**. Hapus isi `Code.gs`, tempel isi file `server/Code.gs` dari repo ini, lalu **Save**.
3. Pilih fungsi **`setup`** → **Run** → setujui izin.
   - Buka **Execution log**: tercatat email `super@lightech.co.id` beserta **password sekali pakai**. Simpan di password manager.
   - ✅ Cek: Sheet sekarang punya tab `docs` dan `audit`.
   - Lalu pilih fungsi **`setupAlphaLeaders`** → **Run**. Company AlphaLeaders langsung jadi: logo, tema hitam-emas, funnel COV → ABM → ABE, 3 program. Execution log mencatat **password sekali pakai Owner** (`owner@alphaleaders.id`).
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy**, lalu salin URL yang berakhiran `/exec`.
   - ✅ Cek: buka URL itu di browser. Harus muncul `{"ok":true,"service":"lightech-mentoring-app",...}`.

## Langkah 2 — Paket website (2 menit)

Pilih salah satu:
- **A. Dari repo:** `API_URL="https://script.google.com/macros/s/…/exec" node scripts/build-deploy.mjs` → hasilnya `dist/lightech-alpha.zip`.
- **B. Dari zip yang sudah jadi:** buka `lightech-alpha.zip`, edit `assets/config.js`, lalu isi `apiUrl: "https://script.google.com/macros/s/…/exec"`.

Paket default: link utama `lightech.co.id/alpha/` langsung membuka **login AlphaLeaders** (`defaultTenant: "alphaleaders"`). Tim Lightech masuk lewat `lightech.co.id/alpha/#lightech`. Untuk halaman login netral, build dengan `DEFAULT_TENANT= node scripts/build-deploy.mjs`.

## Langkah 3 — Ganti /alpha (5 menit)

Di cPanel → **File Manager** → `public_html/`:
1. **Backup dulu:** rename folder `alpha` → `alpha_backup_YYYYMMDD`. Jangan dihapus.
2. Buat folder `alpha` baru, upload `lightech-alpha.zip`, lalu **Extract**.
   - Pastikan `.htaccess` ikut terekstrak (aktifkan "Show Hidden Files").
3. ✅ Cek: buka `https://lightech.co.id/alpha/`. Harus muncul halaman **Sign in** netral, tanpa logo company mana pun.

## Langkah 4 — Setup company & go-live (5 menit)

1. Di `https://lightech.co.id/alpha/#lightech` login dengan `super@lightech.co.id` + password dari langkah 1.
2. **Lightech admins → Edit diri sendiri → ganti password.** Peringatan "default password" harus hilang.
3. AlphaLeaders sudah dibuat oleh `setupAlphaLeaders` (langkah 1). Company lain: **Companies → + New company**.
4. Kirim ke owner AlphaLeaders: link **`https://lightech.co.id/alpha/`** + `owner@alphaleaders.id` + password sekali pakai dari Execution log, lewat kanal privat (WA pribadi, bukan grup). Owner langsung ganti password di **Team & Access**.
5. ✅ Cek: buka link itu di jendela incognito. Yang muncul hanya brand AlphaLeaders.
6. **Opsional: form lead publik.** Owner → Settings → *Lead capture form* → centang *Form is live*. Link `https://lightech.co.id/alpha/?form=alphaleaders` bisa dipasang di bio Instagram / landing page iklan (tambah `&src=Meta Ads` per kampanye).
7. **Sebelum data asli masuk:**
   - matikan *demo sign-in* di Settings company
   - klik *Delete example data*

## Rollback (1 menit)

Kalau ada masalah: rename `alpha` → `alpha_failed`, lalu `alpha_backup_YYYYMMDD` → `alpha`. Data di Google Sheet tidak tersentuh.

## Update versi berikutnya

1. `git pull` → `API_URL=… node scripts/build-deploy.mjs` → upload & extract ke `alpha/` (timpa). Asset punya versi (`?v=hash`), jadi browser langsung memuat yang baru.
2. Kalau `server/Code.gs` berubah: tempel ulang di Apps Script → **Deploy → Manage deployments → Edit → New version**. URL `/exec` tetap sama.

## Catatan operasional

| Topik | Praktik |
|---|---|
| Backup data | Google Sheet → File → Version history (otomatis). Tambahan mingguan: File → Download → .xlsx ke folder arsip. |
| Akses Sheet | Hanya Owner + 1 IT backup. Staf company **tidak** perlu akses Sheet, semuanya lewat aplikasi. |
| Kapasitas | Nyaman sampai ±20.000 baris (puluhan company kecil-menengah). Lewat itu, migrasi ke Supabase/Postgres (roadmap). |
| Monitoring | Lightech Console → **Audit log**: login gagal beruntun = sinyal percobaan masuk; `capture` = lead dari form publik. |
| Install di HP | Buka link di Chrome/Safari → *Add to Home Screen*. Tampil seperti aplikasi (PWA). |
