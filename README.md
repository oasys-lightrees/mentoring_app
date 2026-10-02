# Mentoring CRM — Lead to Deal (MVP)

CRM untuk bisnis **coaching / mentoring / training / consulting** yang 1 sistemnya bisa dipakai beberapa brand (**AlphaLeaders**, **PIWA**, dst). Fokus MVP: **pantau dari lead masuk sampai deal**.

> Zero install. Buka `index.html` di browser → langsung jalan (offline juga bisa). Data tersimpan di browser (localStorage), bisa backup/restore JSON & export CSV.

## Cara jalanin

```bash
# opsi 1: double-click index.html
# opsi 2: serve lokal (biar URL rapi, enak buat demo)
npx serve .        # atau: python3 -m http.server 8080
```

Deploy cepat: GitHub Pages / Netlify / Vercel (static, tanpa build).

## Apa yang sudah jalan (MVP "smallest triangle": Lead → Session → Deal)

| Modul | Fungsi |
|---|---|
| **Multi-workspace / brand** | Switch AlphaLeaders ↔ PIWA dari header. Tiap workspace punya warna, label, funnel, tim, program & data sendiri. Bisa bikin workspace baru dari template. |
| **Label configurable** | Mentor → Coach / Teacher / PT / Consultant. Session → Class / Webinar / Workshop. Lead → Prospect, Client → Member, dll. Semua UI ikut berubah. |
| **Funnel stage configurable** | Tambah/rename/urutkan stage, warna, probabilitas (%), SLA hari. Stage Won & Lost sudah built-in. |
| **Lead input** | Nama, perusahaan, WA, email, sumber, PIC (BD/Sales), program diminati (harga auto-isi), next action + tanggal, catatan. Deteksi nomor WA duplikat. |
| **Pipeline Kanban** | Drag & drop antar stage + dropdown (mobile). Kartu tampilkan nilai, PIC, jadwal sesi berikutnya, next action (merah kalau overdue), badge "stuck" kalau lewat SLA. |
| **Won / Lost discipline** | Won wajib konfirmasi nilai deal & program. Lost wajib alasan → jadi data analitik. |
| **Session scheduling** | Jenis sesi configurable & terhubung ke stage. **Jadwalkan sesi = lead otomatis maju ke stage itu.** Selesaikan sesi → catatan + pilih next step (lanjut / lost) + next action. WA reminder 1-klik (template configurable). |
| **Dashboard** | KPI (lead masuk, pipeline & weighted pipeline, deal won, revenue, win rate, sales cycle), funnel conversion per stage, daftar "Butuh Aksi" (overdue, stuck, tanpa next step), leaderboard BD/Sales (SUKA-ready), performa per sumber lead, sesi mendatang. Filter periode. |
| **Lead detail** | Drawer: klik stage untuk pindah, next action, detail, semua sesi, timeline riwayat stage (audit trail). |
| **Data** | Backup/restore JSON, export CSV, isi ulang data demo, kosongkan data untuk go-live. |

## Default funnel per template

**AlphaLeaders** — Lead Masuk → COV Call (15m) → ABM Mapping (2–3j) → ABE Closing (2j) → Deal Won / Lost.
Sesi delivery setelah deal: Coaching Session, Review / Induction.

**PIWA** — Prospect Baru → Preview / Webinar → Konsultasi 1-on-1 → Penawaran → Enrolled / Lost.
Sesi delivery: Class, Workshop.

> Catatan: posisi ABE beda di 2 versi draft (closing vs. coaching rutin). Default di sini ABE = closing (sesuai planning doc). Kalau mau ABE = sesi rutin pasca-deal, cukup ubah di **Settings → Stage Funnel & Jenis Session** — tanpa coding.

## Demo script (± 7 menit)

1. **Dashboard (1 menit)**: “Ini kondisi bisnis real-time: berapa lead masuk, pipeline berapa rupiah, win rate, dan siapa yang closing paling banyak.” Tunjuk *Butuh Aksi*: “Sistem yang nagih follow-up, bukan manajer.”
2. **Input lead live (1 menit)**: klik **+ Lead**, isi nama + WA + program. Harga auto-isi. Lead langsung muncul di pipeline.
3. **Jadwalkan COV (1 menit)**: dari drawer lead, klik **Jadwalkan Session**. Lead otomatis pindah ke stage COV. Klik **WA reminder**.
4. **Selesaikan sesi → ABM → Closing (2 menit)**: tandai selesai, isi catatan, pilih *Lanjut → ABM*. Ulangi sampai **Won**: masukkan nilai deal. Dashboard revenue & leaderboard langsung naik.
5. **Switch ke PIWA (1 menit)**: ganti workspace di header. Label, warna, funnel & sesi berubah. “Satu engine, banyak brand.”
6. **Settings (1 menit)**: ganti label *Mentor → Teacher* live. “Bisa dipakai untuk PT, consultant, trainer, apa pun.”

## Arsitektur

```
index.html          shell UI
assets/presets.js   template workspace (AlphaLeaders, PIWA, Blank) + role
assets/app.js       store, domain logic, views (dashboard, pipeline, leads, sessions, settings)
assets/app.css      styling (tanpa framework, aman offline)
```

Data model (per workspace): `config` (labels, stages, sessionTypes, sources, lostReasons, waTemplate) · `team` · `programs` · `leads` (+ `history` stage) · `sessions`.
Layer `Store` sengaja tipis, supaya gampang diganti ke backend (Supabase / Odoo) tanpa ubah UI.

## Roadmap setelah MVP

- **Phase 2: Multi-user & cloud**: login + role (Senior Mentor, Coach, Ast. Mentor, PA/Admin/CS, BD), data di Supabase/Postgres atau Odoo module, "My leads" per user.
- **Phase 3: Automation**: n8n + WA API untuk reminder H-1 & H-1 jam, lead form/webhook dari Meta Ads masuk otomatis, auto-assign round-robin ke BD.
- **Phase 4: Delivery & retention**: client program 1 tahun (progress sesi, action plan), AI session summary (Claude API), churn/health score, renewal pipeline.
- **Phase 5: Performance**: leaderboard SUKA + Self Compensation (komisi otomatis dari deal won), KPI per coach.
