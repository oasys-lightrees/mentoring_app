# UAT AlphaLeaders: Lead masuk → ABM → Deal → Reports

Panduan testing 1 minggu untuk tim AlphaLeaders sebelum data asli masuk.
Fokus: **lead masuk → COV → ABM → ABE → Deal Won → Reports**.
Seluruh skenario ini juga dijalankan otomatis setiap ada update (`tests/e2e-uat.js`, 30 cek).

| | |
|---|---|
| Link | https://lightech.co.id/alpha/ |
| Durasi | 5 hari kerja (Senin–Jumat) |
| PIC UAT | Owner (Coach Ferly / Ferry) + 1 PA (Tami / Anita) sebagai pencatat temuan |
| Peserta | 2 Owner, 2 PA, 6 Coach, 2 BD |
| Data | **Data testing saja.** Mode Testing aktif, semua data uji dihapus 1 klik di akhir minggu. |

---

## Hari 0 — Persiapan Owner (±20 menit)

Login sebagai Owner → **Settings**.

1. **Istilah** (kartu *Istilah*):
   - Klik preset: Sesi → **Session / Class / Meeting / Sesi / Kelas**, Mentor → **Coach**, Klien → **Client / Member**.
   - Atau ketik bebas di kolom mana pun. Kolom punya daftar saran.
   - ✅ Tombol di atas langsung berubah, mis. `+ Class`.
2. **Nama funnel** (kartu *Stage funnel* → *Nama funnel cepat*):
   - Pilih salah satu preset:

     | Preset | Alur |
     |---|---|
     | **COV → ABM → ABE** | AlphaLeaders klasik |
     | **Pre-Session → Diagnostics → Closing** | |
     | **Webinar → Assessment → Proposal** | |

   - Nama tiap stage tetap bisa diketik bebas, mis. `Diagnostics (ABM)`.
   - Jenis sesi yang terhubung ikut berganti nama. Lead yang sudah ada tetap di stage-nya.
   - Prob % dan SLA (hari) per stage bisa disesuaikan.
3. **Investment Matrix**: *Paste dari Excel* → ✅ 8 program dikenali.
4. **Target & Self Compensation**: target per BD, komisi %, bonus %.
5. **Data → centang "Mode testing (UAT)"**.
   - ✅ Banner biru *MODE TESTING* muncul di semua halaman.
   - Semua lead yang dibuat selama mode ini ditandai sebagai data testing.

## Hari 1–4 — Skenario

Setiap orang menjalankan skenario sesuai perannya. Pakai nama dummy berawalan **UAT**, mis. `UAT Budi`, dengan nomor WA milik tim sendiri.

### S1. Lead masuk (BD, PA)
| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| 1.1 | `+ Lead` → nama, WA, program, term (4×/2×/1×) → Simpan | Lead di stage pertama; nilai = harga term × 12 bulan |
| 1.2 | Tambah lead dengan nomor WA yang sama | Ditolak sebagai duplikat |
| 1.3 | Isi form publik: `https://lightech.co.id/alpha/?form=alphaleaders&src=Instagram` (Owner aktifkan dulu di Settings) | Lead baru muncul ≤15 detik, sumber = Instagram, otomatis ke BD dengan lead aktif paling sedikit |
| 1.4 | Import 5 lead dari Excel (Leads → Import) | Masuk semua, duplikat dilewati, dibagi ke BD |
| 1.5 | BD login | Hanya melihat lead miliknya penuh; lead BD lain hanya angka (tanpa nama/WA) |

### S2. Follow-up sampai ABM (BD, PA, Coach)
| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| 2.1 | Buka lead → **WhatsApp** | WA terbuka dengan nomor benar |
| 2.2 | Isi *Next action* + tanggal | Muncul di Dashboard → *Perlu tindakan* |
| 2.3 | **Jadwalkan Class/Session** | Jenis terisi otomatis ke langkah berikutnya (COV / Pre-Session) |
| 2.4 | Simpan | Lead otomatis pindah ke stage itu; tercatat di riwayat |
| 2.5 | Jadwalkan lagi → ABM / Diagnostics | Lead pindah ke ABM; Coach yang ditunjuk melihat jadwalnya |
| 2.6 | Coach buka **Sessions** (kalender minggu) | Hanya jadwal miliknya; bisa isi catatan & action items |
| 2.7 | Kirim pengingat WA dari jadwal | Teks berisi nama, jenis sesi, coach, tanggal, jam |
| 2.8 | Lead tidak bergerak melewati SLA | Ditandai *idle* di pipeline |

### S3. Closing sampai Deal (BD, Owner)
| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| 3.1 | Jadwalkan ABE / Closing | Lead pindah ke stage closing |
| 3.2 | **Deal Won** → term + commitment payment | Nilai kontrak = term × 12; client otomatis dibuat |
| 3.3 | Buka client | Jadwal pembayaran: commitment di awal + cicilan sesuai term |
| 3.4 | 1 lead → **Lost** | Wajib pilih alasan; masuk laporan lost reason |
| 3.5 | Geser kartu di **Pipeline** (drag) | Stage berubah, riwayat tercatat |

### S4. Reports (Owner, BD)
| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| 4.1 | **Reports** → revenue 12 bulan | Bulan ini = total deal won |
| 4.2 | Forecast per stage | Nama stage = nama baru; nilai × prob % |
| 4.3 | Cohort & sumber lead | Instagram / Import / manual terhitung benar |
| 4.4 | Self Compensation | Owner melihat semua BD; BD hanya barisnya sendiri |
| 4.5 | Dashboard → leaderboard | Ranking BD sesuai revenue |
| 4.6 | Export CSV | File terbuka di Excel dengan kolom lengkap |

### S5. Hak akses & keamanan (semua)
| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| 5.1 | Login pertama dengan password sekali pakai | Wajib buat password sendiri |
| 5.2 | Salah password 5× | Akun terkunci 15 menit |
| 5.3 | Coach coba buka Settings | Menu tidak ada |
| 5.4 | Buka di HP → *Add to Home Screen* | Tampil seperti aplikasi |

## Hari 5 — Review & go-live
1. PIC merekap temuan (format di bawah). Prompt perbaikan ke Claude dan versi baru otomatis live setelah lolos test.
2. Owner → **Settings → Data**:
   - **Hapus data contoh & testing** → ✅ semua lead/sesi/client testing hilang. Istilah, funnel, program, dan akun tetap.
   - Matikan **Mode testing**.
3. Mulai input data asli.

## Format laporan temuan
Satu baris per temuan (Google Sheet / grup WA UAT):

| No | Nama | Peran | Skenario # | Yang dilakukan | Yang terjadi | Yang diharapkan | Screenshot | Prioritas (Tinggi/Sedang/Rendah) |
|---|---|---|---|---|---|---|---|---|

**Kriteria lulus UAT:** semua skenario S1–S4 berjalan, nol temuan *Tinggi* tersisa, dan Owner setuju angka di Reports cocok dengan rekap manual minggu itu.
