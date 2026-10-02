# Lightrees Mentoring CRM

Satu sistem **Lead → Deal → Client** untuk bisnis coaching, mentoring, training & consulting. Satu aplikasi bisa dipakai banyak brand (**AlphaLeaders**, **PIWA**, **iPlus Leader**, dst). Semua label, funnel dan master data bisa diatur tanpa coding.

> **v0.3** = merge `mentoring_app` v0.1 (funnel CRM multi-brand) + `presensi/coaching.html` v0.2 (login, RBAC 5 peran, mentor↔asisten, client, action items).

## Cara pakai

| Mode | Cara buka | Data tersimpan di |
|---|---|---|
| **Cloud (rekomendasi)** | [Link Claude Artifact](https://claude.ai/artifact/PDk86467k37K7Qs4wWPKoh) (privat, bagikan lewat menu Share) | Database online artifact, sinkron real-time untuk semua user yang punya akses link |
| **Lokal** | Buka `index.html` di browser (atau `npx serve .`) | localStorage browser itu saja (pakai Backup JSON rutin) |

Aplikasinya mendeteksi sendiri mode mana yang dipakai. Indikator di header: **Cloud · tersimpan** atau **Tersimpan di browser ini**.

**Login demo:** semua akun awal memakai password `demo`, dan di layar login ada tombol 1 klik per peran. Matikan di **Settings → Brand → Login demo** sebelum go-live, lalu ganti password lewat **Tim & Akses**.

## Fitur

| Modul | Isi |
|---|---|
| **Multi-workspace** | AlphaLeaders, PIWA dan iPlus dalam 1 app. Bisa ganti dari header, plus template untuk brand baru. |
| **Label configurable** | Mentor → Coach / Teacher / PT / Consultant. Session → Class / Webinar / Workshop. Lead → Prospect, Client → Member. |
| **Login + 7 peran** | Superadmin, Admin/PA/CS, Senior Mentor, Mentor, Ast. Mentor (terhubung ke mentornya), BD/Sales, Client. Menu & data otomatis menyesuaikan peran. |
| **Lead & Pipeline** | Form lead (deteksi WA dobel), kanban drag & drop, Won wajib isi nilai deal, Lost wajib isi alasan, SLA "diam", next action + overdue. |
| **Sessions** | Jenis sesi terhubung ke stage. Menjadwalkan sesi = lead otomatis naik stage. Ada catatan, action items, WA reminder 1 klik, dan asisten ikut otomatis. |
| **Clients** | Deal Won otomatis jadi Client (program, coach, asisten, periode). Ada progress sesi, action items, countdown renewal, dan flag risiko churn. |
| **Portal client** | Client login dan melihat progress program, jadwal & action plan miliknya. |
| **Dashboard** | KPI, funnel conversion, daftar butuh aksi, leaderboard BD (SUKA), sesi mendatang, performa per sumber lead. |
| **Data** | Backup/restore JSON, export CSV, hapus data contoh (go-live), workspace baru. |

## Arsitektur

```
index.html                  shell UI (mode lokal)
assets/presets.js           template workspace + matriks hak akses
assets/app.js               backend (cloud/lokal), RBAC, semua view
assets/app.css              design system Lightrees (navy/emas, Plus Jakarta Sans), light & dark
scripts/build-artifact.mjs  build dist/artifact.html untuk Claude Artifact
```

**Model data per workspace:** `config` (labels, stages, sessionTypes, sources, lostReasons, waTemplate, demoLogin) · `accounts` · `programs` · `leads` (+history) · `sessions` (+actionItems) · `clients`.

**Cloud:** `ws/{id}` (config + akun + program) · `ws/{id}/leads/*` · `ws/{id}/sessions/*` · `ws/{id}/clients/*`. Satu dokumen per record, sehingga edit dari banyak user tidak saling menimpa.

**Update artifact:** `node scripts/build-artifact.mjs`, lalu publish ulang `dist/artifact.html` beserta `assets/*` ke URL artifact yang sama.

## Batasan yang perlu diketahui

- Login & RBAC adalah kontrol **tampilan**. Password di-hash (SHA-256 + salt), tapi pengecekan masih di sisi browser. Siapa yang bisa membuka link tetap diatur lewat **Share** di artifact. Untuk produksi skala besar, pindahkan auth ke backend (Supabase / Odoo).
- Mode lokal tidak berbagi data antar device, jadi pakai mode cloud untuk tim.

## Demo script (± 8 menit)

1. **Login** pakai tombol *Superadmin*. Dashboard tampilkan KPI, funnel, dan daftar *Butuh aksi*.
2. **+ Lead** diisi live (nama, WA, program); harga terisi otomatis.
3. Di drawer lead, **Jadwalkan Session**. Lead otomatis pindah ke COV. Tunjukkan WA reminder.
4. **Selesai** pada sesi, lalu *Lanjut → ABM*. Ulangi sampai **Deal Won**. Client otomatis terbentuk.
5. Tab **Clients**: progress program, action items, renewal.
6. **Keluar**, login sebagai *BD*: hanya lead miliknya yang terlihat. Login sebagai *Client*: portal.
7. Ganti workspace ke **PIWA**: label, warna & funnel berubah. Satu engine untuk banyak brand.

## Roadmap

- **Automation**: n8n + WA API (reminder H-1, lead dari Meta Ads masuk otomatis, round-robin BD).
- **AI**: ringkasan sesi otomatis (Claude API), lalu progress report untuk client.
- **Performance**: komisi otomatis dari deal won (Self Compensation), KPI per coach.
- **Backend production**: auth server-side, audit log, integrasi Odoo.
