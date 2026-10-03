# Go-live AlphaLeaders: Google Sheet + Apps Script (tanpa hosting)

Satu Google Sheet + satu file kode = app production yang bisa langsung dipakai tim AlphaLeaders.
Data tersimpan di Sheet milik Anda, login per orang, setiap perubahan tercatat di audit log.

- Kode yang dipakai (versi terkunci): https://raw.githubusercontent.com/oasys-lightrees/mentoring_app/b782c8713d336271a707437f93d0a7dd6fbe30de/server/Code.gs
- Estimasi: 10 menit langkah teknis + 15 menit setup Owner

## Bagian A: dikerjakan Claude in Chrome (atau manual), sekitar 10 menit

1. Buka **https://sheets.new**. Beri nama Sheet: **AlphaLeaders CRM — Data**.
2. Menu **Extensions → Apps Script**. Beri nama project: **AlphaLeaders CRM**.
3. Di tab baru, buka link kode di atas, tekan **Ctrl+A**, lalu **Ctrl+C**.
4. Kembali ke editor Apps Script, klik di dalam `Code.gs`, tekan **Ctrl+A**, **Ctrl+V**, lalu **Ctrl+S**.
5. Di dropdown fungsi (sebelah tombol Run) pilih **`setup`**, lalu klik **Run**.
   - Google minta izin: **Review permissions** → pilih akun → **Advanced** → **Go to AlphaLeaders CRM (unsafe)** → **Allow**.
   - Peringatan "unsafe" itu normal untuk script buatan sendiri.
6. Pilih **`setupAlphaLeaders`**, lalu **Run**.
   - Execution log mencatat 13 baris password sekali pakai: 1 Lightech Super Admin + 12 tim AlphaLeaders.
   - Log ini tetap tersimpan di menu **Executions**. Jangan disalin ke tempat lain.
7. Klik **Deploy → New deployment**, lalu ikon gear → **Web app**.
   - Description: `v1.2`
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Klik **Deploy**. Kalau diminta izin lagi, ikuti langkah 5.
8. Salin **Web app URL** (berakhiran `/exec`).
9. ✅ Cek: buka URL itu. Yang muncul harus halaman login AlphaLeaders lengkap dengan logo.
10. ✅ Cek: buka URL yang sama dengan tambahan `?health=1`. Yang muncul harus `{"ok":true,...}`.

## Bagian B: Owner (Coach Ferly), sekitar 15 menit

1. Buka Web app URL, login `ferly@alphaleaders.id` dengan password sekali pakai dari log, lalu buat password sendiri.
2. **Settings → Paste dari Excel**:
   - Di file Investment Matrix, blok baris program (kolom Program sampai Inner Circle), copy, lalu paste.
   - ✅ Cek: 8 program dikenali.
3. **Settings → Target sales & Self Compensation**: isi target per BD, komisi %, dan bonus %.
4. **Team & Access**:
   - Ganti email placeholder `@alphaleaders.id` dengan email asli tiap orang. Email ini dipakai untuk login.
   - Akun yang sudah dibuat: Ferly, Ferry (Owner + coach), Tami, Anita (PA), Josshhua, Anthony, Wulansari, Charles, Malvin, Rizki (coach), Julia, Paul (BD).
5. Kirim ke tiap orang lewat **WA pribadi**:
   - Web app URL
   - email masing-masing
   - password sekali pakai masing-masing
   
   Saat login pertama, setiap orang wajib membuat password sendiri.
6. Opsional: **Settings → Lead capture form → Form is live**.
   - Link form: `<Web app URL>?form=alphaleaders&src=Instagram`
   - Ganti `src` per kampanye supaya sumber lead tercatat.

## Link yang perlu diingat

| Untuk | Link |
|---|---|
| Tim AlphaLeaders | `<Web app URL>` |
| Form lead publik | `<Web app URL>?form=alphaleaders&src=<kampanye>` |
| Lightech Console | `<Web app URL>?view=lightech` (login `super@lightech.co.id`) |
| Cek kesehatan | `<Web app URL>?health=1` |

## Update versi berikutnya

Tempel kode baru di `Code.gs`, Save, lalu **Deploy → Manage deployments → Edit (ikon pensil) → Version: New version → Deploy**.
URL `/exec` tetap sama dan data tidak tersentuh.

## Kalau ada masalah

| Gejala | Penyebab & solusi |
|---|---|
| Halaman putih / tanpa tampilan | Jaringan memblokir CDN. App otomatis mencoba CDN cadangan; coba refresh atau gunakan jaringan lain. |
| "Cannot reach the server" | Deployment belum **Anyone**. Edit deployment, set Who has access = Anyone. |
| Login gagal 5× | Akun dikunci 15 menit (pengaman brute force). Tunggu, atau Owner reset password di Team & Access. |
| Lupa password | Owner reset di Team & Access. Orang itu wajib membuat password baru saat login berikutnya. |

## Keamanan (GCG)

- Password di-hash (SHA-256 + salt) dan tidak pernah dikirim ke browser.
- Password sekali pakai wajib diganti saat login pertama.
- Setiap orang hanya melihat data sesuai perannya.
- Audit log ada di tab `audit` pada Sheet.
- Akses Sheet: hanya Owner + 1 cadangan. Tim tidak perlu akses Sheet karena semuanya lewat app.
- Backup otomatis lewat Version history Google Sheet. Tambahan mingguan: File → Download → .xlsx.
