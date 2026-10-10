# Deploy ke lightech.co.id/alpha (atau domain sendiri)

> **Jalur utama: [GO-LIVE.md](GO-LIVE.md)**. GitHub Actions otomatis men-deploy database + API ke Supabase dan website ke `lightech.co.id/alpha` (FTP) setiap ada perubahan di `main`. Runbook di bawah ini adalah **jalur manual** (upload zip) kalau Actions tidak bisa dipakai.

Estimasi waktu: **±15 menit**. Setiap langkah punya titik cek, dan ada jalur rollback.

## Ringkasan arsitektur

```
Browser ──► lightech.co.id/alpha/            (file statis: index.html + assets/)
              └─ assets/config.js → apiUrl ──► Supabase Edge Function "api" (server/core.js + server/pg.js)
                                                  └─ PostgreSQL: companies, leads, sessions, clients, audit_log, kv
```

- Login, pemisahan data antar company, dan audit log dicek di **server**. Password tidak pernah dikirim ke browser.
- Website hanya file statis: bisa dipindah ke hosting mana pun tanpa menyentuh data.

---

## Langkah 1 — Backend

Sudah selesai lewat [GO-LIVE.md](GO-LIVE.md) Bagian A. Yang dibutuhkan di sini hanya **Endpoint URL**: `https://<project-ref>.supabase.co/functions/v1/api`.

Alternatif lewat terminal (Supabase CLI), untuk tim IT:
```
supabase login
supabase link --project-ref <project-ref>
supabase db push                       # menjalankan supabase/migrations/*.sql
supabase functions deploy api          # verify_jwt=false sudah diatur di supabase/config.toml
```
Setup code: `select code from app_setup;` di SQL Editor.

## Langkah 2 — Paket website (2 menit)

Pilih salah satu:
- **A. Dari repo:** `API_URL="https://<project-ref>.supabase.co/functions/v1/api" node scripts/build-deploy.mjs` → hasilnya `dist/lightech-alpha.zip`.
- **B. Dari zip yang sudah jadi:** buka `lightech-alpha.zip`, edit `assets/config.js`, lalu isi `apiUrl: "https://<project-ref>.supabase.co/functions/v1/api"`.

Paket default: link utama `lightech.co.id/alpha/` langsung membuka **login AlphaLeaders** (`defaultTenant: "alphaleaders"`). Tim Lightech masuk lewat `lightech.co.id/alpha/#lightech`. Untuk halaman login netral, build dengan `DEFAULT_TENANT= node scripts/build-deploy.mjs`.

## Langkah 3 — Ganti /alpha (5 menit)

**Otomatis (1 perintah):** buat API token di cPanel → *Security → Manage API Tokens*, lalu:
`CPANEL_HOST=lightech.co.id CPANEL_USER=<user> CPANEL_TOKEN=<token> node scripts/deploy-cpanel.mjs`
Script ini membackup `alpha` → `alpha_backup_<tanggal>`, upload + extract zip, lalu cek situsnya live. Coba dulu dengan `--dry-run`.

**Manual:**

Di cPanel → **File Manager** → `public_html/`:
1. **Backup dulu:** rename folder `alpha` → `alpha_backup_YYYYMMDD`. Jangan dihapus.
2. Buat folder `alpha` baru, upload `lightech-alpha.zip`, lalu **Extract**.
   - Pastikan `.htaccess` ikut terekstrak (aktifkan "Show Hidden Files").
3. ✅ Cek: buka `https://lightech.co.id/alpha/`. Harus muncul login **AlphaLeaders** (atau **First-time setup** kalau database masih kosong).
4. Kalau `ALLOWED_ORIGINS` dipakai (GO-LIVE B.5): tambahkan `https://lightech.co.id`, pisahkan dengan koma.

## Langkah 4 — Cek & go-live (3 menit)

1. Database masih kosong → ikuti [GO-LIVE.md](GO-LIVE.md) Bagian C (First-time setup) dan D (Owner).
2. Database sudah dipakai (pindah dari Vercel) → login seperti biasa. Data, akun, dan password sama persis.
3. ✅ Cek: buka link di jendela incognito. Yang muncul hanya brand AlphaLeaders.
4. Lightech Console: `https://lightech.co.id/alpha/#lightech`.
5. Form lead publik: `https://lightech.co.id/alpha/?form=alphaleaders&src=<kampanye>`.

## Rollback (1 menit)

Kalau ada masalah: rename `alpha` → `alpha_failed`, lalu `alpha_backup_YYYYMMDD` → `alpha`. Data di database tidak tersentuh.

## Update versi berikutnya

1. `git pull` → `API_URL=… node scripts/build-deploy.mjs` → upload & extract ke `alpha/` (timpa). Asset punya versi (`?v=hash`), jadi browser langsung memuat yang baru.
2. Kalau `server/` berubah: `node scripts/build-edge.mjs`, lalu `supabase functions deploy api` (atau tempel `supabase/functions/api/index.ts` di editor function). Endpoint URL tetap sama.
3. Kalau ada file baru di `supabase/migrations/`: jalankan di SQL Editor (atau `supabase db push`).

## Catatan operasional

| Topik | Praktik |
|---|---|
| Backup data | Supabase Pro: backup harian otomatis (+ Point-in-Time Recovery opsional). Tambahan mingguan: Settings → Backup (JSON) per company ke folder arsip. |
| Akses database | Dashboard Supabase hanya Lightech (Owner + 1 IT backup). Staf company **tidak** perlu akses, semuanya lewat aplikasi. Key publik (anon) tidak bisa membaca tabel (RLS aktif tanpa policy). |
| Kapasitas | PostgreSQL: ratusan ribu record per company tanpa masalah. Tabel punya kolom terketik (nama, stage, owner, value) + index untuk report & BI. |
| Monitoring | Lightech Console → **Audit log**: login gagal beruntun = sinyal percobaan masuk; `capture` = lead dari form publik. |
| Install di HP | Buka link di Chrome/Safari → *Add to Home Screen*. Tampil seperti aplikasi (PWA). |
