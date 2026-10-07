# Go-live AlphaLeaders: Supabase (PostgreSQL) + Vercel

Database SQL yang proper (PostgreSQL di Supabase), API server di Supabase Edge Function, dan website di Vercel.
Semua gratis untuk mulai. Login per orang, data per company terpisah di server, dan setiap perubahan tercatat di audit log.

```
Browser (HP / laptop)
  └─ Website (Vercel)                   index.html + assets  →  config: API_URL
       └─ Supabase Edge Function "api"  server/core.js: login, hak akses per role, form lead, audit
            └─ PostgreSQL               tabel companies, leads, sessions, clients, audit_log (RLS aktif)
```

- **Estimasi:** 20 menit teknis + 15 menit setup Owner
- **Bisa dikerjakan Claude in Chrome:** prompt siap pakai ada di bagian paling bawah.

| File yang dipakai | Link (versi terkunci) |
|---|---|
| Skema database (SQL) | `__SQL_LINK__` |
| Kode API (Edge Function) | `__EDGE_LINK__` |

## Bagian A: Database & API di Supabase (±10 menit)

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

## Bagian B: Website di Vercel (±5 menit)

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

## Bagian C: Setup pertama (±2 menit, sekali saja)

Di halaman **First-time setup**:

1. **Setup code**: kode dari A.3.
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

1. Buka link website, login `ferly@alphaleaders.id` dengan password sekali pakai, lalu buat password sendiri.
2. **Settings → Paste dari Excel**:
   - Di file Investment Matrix, blok baris program (kolom Program sampai Inner Circle), copy, lalu paste.
   - ✅ Cek: 8 program dikenali.
3. **Settings → Target sales & Self Compensation**: isi target per BD, komisi %, dan bonus %.
4. **Team & Access**:
   - Ganti email placeholder `@alphaleaders.id` dengan email asli tiap orang. Email ini dipakai untuk login.
5. Kirim ke tiap orang lewat **WA pribadi** (bukan grup), hanya bagiannya sendiri:
   - link website
   - email masing-masing
   - password sekali pakai masing-masing

   Saat login pertama, setiap orang wajib membuat password sendiri.
6. Opsional: **Settings → Lead capture form → Form is live**.
   - Link form: `<link website>?form=alphaleaders&src=Instagram`
   - Ganti `src` per kampanye supaya sumber lead tercatat.

## Link yang perlu diingat

| Untuk | Link |
|---|---|
| Tim AlphaLeaders | `<link website>` |
| Form lead publik | `<link website>?form=alphaleaders&src=<kampanye>` |
| Lightech Console | `<link website>#lightech` (login Super Admin dari Bagian C) |
| Cek kesehatan API | `<Endpoint URL>` (GET) |
| Data mentah (read-only, untuk BI/report) | Supabase → **Table Editor** → `leads`, `sessions`, `clients`, `audit_log` |

## Update versi berikutnya

- **Website**: otomatis. Setiap merge ke `main`, Vercel build ulang sendiri.
- **API**: kalau `supabase/functions/api/index.ts` berubah, tempel ulang di editor function `api` lalu **Deploy**.
- **Database**: file SQL baru di `supabase/migrations/` dijalankan di **SQL Editor**. Data lama tidak tersentuh.

## Kalau ada masalah

| Gejala | Penyebab & solusi |
|---|---|
| "Server tidak bisa dihubungi" | `API_URL` di Vercel salah, atau Verify JWT masih ON (A.5). Perbaiki, lalu Vercel → **Redeploy**. |
| Error 401 saat buka Endpoint URL | Verify JWT masih ON. Matikan (A.5). |
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

## Prompt untuk Claude in Chrome

Salin ke Claude in Chrome. Login Supabase/Vercel dilakukan sendiri bila diminta.

```
Kerjakan GO-LIVE.md di repo oasys-lightrees/mentoring_app, Bagian A dan B saja:
1. supabase.com/dashboard: buat project "lightech-mentoring", region Singapore, generate database password (tampilkan ke saya untuk disimpan).
2. SQL Editor: jalankan isi file dari link "Skema database" di GO-LIVE.md. Laporkan baris SETUP CODE ke saya.
3. Edge Functions → Deploy a new function → Via Editor, nama "api", tempel isi link "Kode API", deploy. Matikan Verify JWT. Salin Endpoint URL.
4. Buka Endpoint URL, pastikan JSON {"ok":true,...}.
5. vercel.com/new: import oasys-lightrees/mentoring_app, env API_URL = Endpoint URL, deploy. Buka hasilnya, pastikan halaman "First-time setup" muncul.
6. Supabase Edge Functions → Secrets: ALLOWED_ORIGINS = domain Vercel.
Jangan isi halaman First-time setup. Itu saya kerjakan sendiri. Laporkan: link website, Endpoint URL, SETUP CODE.
```
