# Go-live AlphaLeaders: Supabase + hosting sendiri (lightech.co.id/alpha), deploy otomatis

**Pilihan stack (paling murah & simple):**

| Bagian | Dipakai | Biaya |
|---|---|---|
| Database + API | **Supabase** (PostgreSQL + Edge Function) | Rp0 (Free). Naik ke Pro $25/bln saat data asli sudah jalan rutin. |
| Website | **Hosting yang sudah ada** untuk `lightech.co.id` (IDwebhost / Hostinger), folder `/alpha` | Rp0 tambahan |
| Deploy | **GitHub Actions**: setiap perubahan otomatis dites lalu di-deploy | Rp0 (repo publik) |
| AWS, Vercel | Tidak dipakai. AWS terlalu rumit & mahal untuk tahap ini; Vercel tidak bisa melayani path `lightech.co.id/alpha`. | – |

```
Prompt ke Claude Code ──► GitHub (main) ──► GitHub Actions: test ─┬─► Supabase: migrasi DB + API
                                                                  └─► FTP: lightech.co.id/alpha (+ cek versi live)
Browser ──► lightech.co.id/alpha ──► https://<project-ref>.supabase.co/functions/v1/api ──► PostgreSQL
```

Setelah setup sekali (±20 menit), semua update cukup lewat prompt. Tidak perlu buka cPanel, Supabase, atau GitHub lagi.

## Bagian A: Setup sekali (±20 menit, bisa dikerjakan Claude in Chrome)

### A.1 Supabase (database + API)
1. Buka **https://supabase.com/dashboard** → login dengan GitHub.
2. **New project**:
   - Name: `lightech-mentoring`
   - Database password: klik **Generate**, **simpan**. Ini jadi secret `SUPABASE_DB_PASSWORD`.
   - Region: **Southeast Asia (Singapore)**.
3. Setelah jadi, lihat URL dashboard: `supabase.com/dashboard/project/<project-ref>`. Kode `<project-ref>` (20 huruf) jadi `SUPABASE_PROJECT_REF`.
4. **Account → Access Tokens** (https://supabase.com/dashboard/account/tokens) → **Generate new token**, nama `github-deploy`. Ini jadi `SUPABASE_ACCESS_TOKEN`.

### A.2 Akun FTP di hosting lightech.co.id
Di panel hosting tempat **domain lightech.co.id** aktif:
- **IDwebhost (cPanel)**: **Files → FTP Accounts** → buat akun, mis. `deploy@lightech.co.id`, Directory `public_html`.
- **Hostinger (hPanel)**: **Files → FTP Accounts**. Catat host, username, password.

Catat juga folder yang dilayani `lightech.co.id/alpha`, dilihat dari root akun FTP:
- cPanel: biasanya `public_html/alpha`
- Hostinger: biasanya `domains/lightech.co.id/public_html/alpha`, atau `public_html/alpha`

### A.3 Simpan di GitHub (sekali)
Buka **https://github.com/oasys-lightrees/mentoring_app/settings/secrets/actions**.

Tab **Secrets** → **New repository secret**:

| Name | Isi |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | token dari A.1.4 |
| `SUPABASE_DB_PASSWORD` | database password dari A.1.2 |
| `SUPABASE_PROJECT_REF` | project-ref dari A.1.3 |
| `FTP_SERVER` | host FTP, mis. `ftp.lightech.co.id` |
| `FTP_USERNAME` | username FTP |
| `FTP_PASSWORD` | password FTP |

Tab **Variables**, hanya kalau berbeda dari default:

| Name | Default |
|---|---|
| `FTP_DIR` | `public_html/alpha` |
| `SITE_URL` | `https://lightech.co.id/alpha/` |

### A.4 Deploy pertama
GitHub → **Actions** → **Test & deploy** → **Run workflow** (branch `main`).
- ✅ Cek: tiga job **test**, **api**, **web** hijau. Job **web** baru hijau setelah `lightech.co.id/alpha` benar-benar menyajikan versi terbaru.
- ✅ Cek: buka **https://lightech.co.id/alpha/**. Halaman **First-time setup** muncul.
- Versi lama di `/alpha` tidak dihapus. Folder itu disimpan sebagai `alpha__prev`.

## Bagian B: (otomatis)
Tidak ada langkah manual. Setiap merge ke `main` menjalankan A.4 sendiri.

## Bagian C: Setup pertama (±2 menit, sekali saja)

Buka **https://lightech.co.id/alpha/**. Di halaman **First-time setup**:

1. **Setup code**: Supabase → **SQL Editor** → jalankan `select code from app_setup;` → salin kodenya.
2. **Lightech Super Admin**: nama, email (default `super@lightech.co.id`), dan password sendiri (min. 10 karakter).
3. Biarkan centang **"Sekaligus buat workspace AlphaLeaders dengan seluruh tim (12 orang)"**.
4. Klik **Setup sekarang**.
   - Muncul tabel 12 orang + **password sekali pakai** masing-masing.
   - Klik **Salin semua** dan simpan sementara di tempat aman (password manager / catatan pribadi).
   - ⚠️ Tabel ini **hanya tampil sekali**.
5. Klik **Lanjut ke halaman login**.
   - ✅ Cek: muncul login AlphaLeaders lengkap dengan logo.
   - Setup code otomatis terhapus dari database. Setup tidak bisa diulang oleh siapa pun.

Akun yang dibuat:

| Role | Orang |
|---|---|
| Owner (+ coach) | Coach Ferly F Raya, Ferry Davira |
| Admin / PA | Tami, Anita |
| Coach | Josshhua Abraham, Anthony Sihombing, Wulansari Suharto, Charles Suryana, Malvin Haryanto, Rizki Esa |
| BD / Sales | Julia, Paul |

## Bagian D: Owner (Coach Ferly), sekitar 15 menit

1. Buka https://lightech.co.id/alpha/, login `ferly@alphaleaders.id` dengan password sekali pakai, lalu buat password sendiri.
2. **Settings → Paste dari Excel**:
   - Di file Investment Matrix, blok baris program (kolom Program sampai Inner Circle), copy, lalu paste.
   - ✅ Cek: 8 program dikenali.
3. **Settings → Target sales & Self Compensation**: isi target per BD, komisi %, dan bonus %.
4. **Team & Access**:
   - Ganti email placeholder `@alphaleaders.id` dengan email asli tiap orang. Email ini dipakai untuk login.
5. Kirim ke tiap orang lewat **WA pribadi** (bukan grup), hanya bagiannya sendiri:
   - link https://lightech.co.id/alpha/
   - email masing-masing
   - password sekali pakai masing-masing

   Saat login pertama, setiap orang wajib membuat password sendiri.
6. Opsional: **Settings → Lead capture form → Form is live**.
   - Link form: `https://lightech.co.id/alpha/?form=alphaleaders&src=Instagram`
   - Ganti `src` per kampanye supaya sumber lead tercatat.

## Link yang perlu diingat

| Untuk | Link |
|---|---|
| Tim AlphaLeaders | `https://lightech.co.id/alpha/` |
| Form lead publik | `https://lightech.co.id/alpha/?form=alphaleaders&src=<kampanye>` |
| Lightech Console | `https://lightech.co.id/alpha/#lightech` (login Super Admin dari Bagian C) |
| Cek kesehatan API | `https://<project-ref>.supabase.co/functions/v1/api` |
| Data mentah (read-only, untuk BI/report) | Supabase → **Table Editor** → `leads`, `sessions`, `clients`, `audit_log` |

## Update versi berikutnya

Cukup minta lewat prompt ke Claude Code (vibecoding). Claude mengubah kode, menjalankan test, lalu merge ke `main`.
GitHub Actions otomatis:
1. menjalankan semua test di PostgreSQL + browser (gagal = tidak ada yang di-deploy)
2. menjalankan migrasi database dan deploy API ke Supabase
3. upload website ke `lightech.co.id/alpha` dan mengecek versi live-nya

Data lama tidak tersentuh. Versi website sebelumnya disimpan sebagai `alpha__prev`.
**Rollback 1 klik**: GitHub → **Actions** → **Test & deploy** → **Run workflow** → action `rollback-web`.

## Kalau ada masalah

| Gejala | Penyebab & solusi |
|---|---|
| Job **api** / **web** di Actions bertuliskan "skipped / not configured" | Secret belum lengkap (Bagian A.3). Lengkapi, lalu **Run workflow**. |
| Job **web** gagal di "Check the live site" | `FTP_DIR` tidak menunjuk ke folder yang dilayani `lightech.co.id/alpha`. Hostinger biasanya `domains/lightech.co.id/public_html/alpha`, IDwebhost/cPanel `public_html/alpha`. |
| Job **web** gagal koneksi FTP (certificate) | Tambah variable `FTP_TLS_VERIFY` = `no` (sertifikat FTP shared hosting sering atas nama server, bukan domain). |
| "Server tidak bisa dihubungi" di app | Lihat job **api** di Actions. Kalau hijau, buka `https://<project-ref>.supabase.co/functions/v1/api` harus `{"ok":true}`. |
| "Wrong setup code" | Salah ketik. Setelah 5× salah, terkunci 15 menit. Kode bisa dilihat lagi: SQL Editor → `select code from app_setup;` |
| Halaman setup tidak muncul lagi | Normal: setup hanya sekali. Langsung login. |
| Login gagal 5× | Akun dikunci 15 menit (pengaman brute force). Tunggu, atau Owner reset password di Team & Access. |
| Lupa password | Owner reset di Team & Access. Orang itu wajib membuat password baru saat login berikutnya. |
| Project Supabase "paused" | Paket gratis berhenti setelah 7 hari tanpa aktivitas. Klik **Restore**. Untuk produksi: upgrade **Pro** (tidak pernah pause + backup harian). |

## Keamanan & data (GCG)

- Password di-hash **PBKDF2-SHA256** (120.000 iterasi, salt unik) dan tidak pernah dikirim ke browser.
- Password sekali pakai wajib diganti saat login pertama. Sesi login berlaku 8 jam dan disimpan di server.
- Setiap orang hanya melihat data sesuai perannya (BD hanya lead-nya sendiri; lead orang lain hanya angka untuk leaderboard).
- **Row Level Security** aktif di semua tabel: key publik Supabase (anon) tidak bisa membaca data apa pun. Hanya API yang mengakses database.
- `audit_log` **append-only**: database menolak edit atau hapus log.
- Backup:
  - Supabase Pro: backup otomatis harian.
  - Tambahan mingguan (gratis): Owner → Settings → **Backup (JSON)**, simpan di folder arsip perusahaan.
- Akses dashboard Supabase: hanya Lightech (Owner + 1 cadangan). Tim AlphaLeaders cukup lewat app.

---

## Prompt untuk Claude in Chrome (Bagian A)

Salin ke Claude in Chrome. Login ke Supabase, hosting, dan GitHub dilakukan sendiri bila diminta.

```
Kerjakan GO-LIVE.md Bagian A di repo oasys-lightrees/mentoring_app:
1. supabase.com/dashboard: buat project "lightech-mentoring", region Singapore, generate database password.
   Catat project-ref dari URL. Buat access token "github-deploy" di Account → Access Tokens.
2. Cari di panel hosting mana (IDwebhost atau Hostinger) domain lightech.co.id aktif. Buat akun FTP untuk deploy.
   Cari folder yang dilayani lightech.co.id/alpha (relatif dari root akun FTP).
3. github.com/oasys-lightrees/mentoring_app/settings/secrets/actions: isi secret SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD,
   SUPABASE_PROJECT_REF, FTP_SERVER, FTP_USERNAME, FTP_PASSWORD. Isi variable FTP_DIR kalau bukan public_html/alpha.
4. GitHub → Actions → "Test & deploy" → Run workflow (main). Tunggu semua hijau. Kalau ada job merah, laporkan pesan errornya.
5. Buka https://lightech.co.id/alpha/ dan pastikan halaman "First-time setup" muncul. Jangan diisi.
Jangan tampilkan password/token di chat. Laporkan: project-ref, hosting yang dipakai, FTP_DIR, status Actions.
```

## Lampiran: jalur manual (tanpa GitHub Actions)

Pakai hanya kalau Actions tidak bisa dipakai.

| File | Link (versi terkunci) |
|---|---|
| Skema database (SQL) | https://raw.githubusercontent.com/oasys-lightrees/mentoring_app/e5a8fc647c5c8e4f1dc468c638143202ff9fa5d1/supabase/migrations/20261007000000_init.sql |
| Kode API (Edge Function) | https://raw.githubusercontent.com/oasys-lightrees/mentoring_app/e5a8fc647c5c8e4f1dc468c638143202ff9fa5d1/supabase/functions/api/index.ts |

### M1. Database & API lewat dashboard Supabase

1. Buka **https://supabase.com/dashboard** → login (pakai akun GitHub paling cepat).
2. **New project**:
   - Name: `lightech-mentoring`
   - Database password: klik **Generate**, simpan di password manager
   - Region: **Southeast Asia (Singapore)**, paling dekat ke Indonesia
   - Klik **Create new project**, tunggu ±2 menit.
3. Menu kiri **SQL Editor** → **New query**.
   - Buka link **Skema database** di atas, **Ctrl+A**, **Ctrl+C**.
   - Tempel di editor, klik **Run**.
   - ✅ Cek: di bawah muncul satu baris **`SETUP CODE: XXXXXXXXXXXX`**. Catat kodenya. Kode ini dipakai sekali di Bagian C.
4. Menu kiri **Edge Functions** → **Deploy a new function** → **Via Editor**.
   - Nama function: **`api`** (huruf kecil, persis).
   - Hapus contoh kode, lalu tempel isi link **Kode API** di atas.
   - Klik **Deploy function**.
5. Masih di function `api` → tab **Details / Settings** → matikan **Verify JWT** (Enforce JWT verification) → **Save**.
   App melakukan login sendiri (email + password), jadi JWT Supabase tidak dipakai.
6. Salin **Endpoint URL** function, bentuknya `https://<project-ref>.supabase.co/functions/v1/api`.
   - ✅ Cek: buka URL itu di browser. Yang muncul: `{"ok":true,"service":"lightech-mentoring-app","version":"2.0.0"}`.


### M2. Website di Vercel (alternatif tanpa hosting sendiri)

1. Buka **https://vercel.com/new** → login dengan GitHub.
2. **Import** repository **`oasys-lightrees/mentoring_app`**.
3. Di layar konfigurasi:
   - Framework Preset: **Other** (build otomatis terbaca dari `vercel.json`)
   - **Environment Variables**: Name `API_URL`, Value = Endpoint URL dari A.6
   - Klik **Deploy**.
4. Setelah selesai, buka domain Vercel-nya (mis. `https://mentoring-app-xxx.vercel.app`).
   - ✅ Cek: yang muncul halaman **First-time setup**.
5. Opsional, tapi disarankan: kunci API hanya untuk website ini.
   Supabase → **Edge Functions → Secrets** → tambah `ALLOWED_ORIGINS` = domain Vercel (mis. `https://mentoring-app-xxx.vercel.app`, tanpa `/` di akhir).


### M3. Website ke lightech.co.id/alpha tanpa Actions
Lihat [DEPLOY.md](DEPLOY.md) (upload zip lewat File Manager).
