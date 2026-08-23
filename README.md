# Planify

Planify adalah prototipe teman belajar mobile-first untuk mahasiswa Indonesia. Repositori ini mencakup fondasi aplikasi, onboarding enam langkah, pemrosesan KRS lokal, dan mesin prioritas Fase 4.

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env.local
npm run dev
```

Buka `http://localhost:3000`. Tanpa kredensial, pilih **Coba mode demo**. Progres onboarding disimpan di `localStorage`, sehingga menutup atau memuat ulang halaman akan melanjutkan dari langkah terakhir.

Jika Supabase tersedia, isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` di `.env.local`. Jalankan kedua migrasi (`202608230001_phase_1_2.sql` lalu `202608230002_phase_3_4.sql`), lalu gunakan daftar/masuk dengan email dan kata sandi. Progres tersimpan di `semesters.setup_payload`, berkas asli di bucket privat `krs`, dan snapshot prioritas di `planning_snapshots`. Kunci rahasia server tidak boleh diberi awalan `NEXT_PUBLIC_`.

## Alur demo

1. Unggah PDF/JPG/JPEG/PNG maksimal 10 MB. PDF digital dibaca langsung; PDF pindaian dan gambar diproses dengan OCR Bahasa Indonesia di browser. Jika perlu, pilih **Isi mata kuliah secara manual**.
2. Periksa, ubah, tambah, atau hapus mata kuliah.
3. Isi jadwal kuliah dan waktu belajar yang tersedia.
4. Isi kebiasaan belajar singkat.
5. Nilai pemahaman dan kesulitan setiap mata kuliah secara terpisah; agenda akademik bersifat opsional.
6. Periksa ringkasan, lalu pilih **Siapkan Prioritas** untuk menghitung prioritas deterministik, menyimpan snapshot (untuk akun), dan membuka `/hari-ini`. Fase ini belum membuat jadwal sesi.

## Pemeriksaan

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Batasan Fase 3–4

Pemrosesan OCR membutuhkan unduhan model Tesseract pertama kali dan berjalan di Web Worker. Mode demo tidak mengunggah berkas; mode akun mengunggah berkas asli langsung dari browser ke bucket privat jika Supabase tersedia. Parser tetap meminta verifikasi pengguna, khususnya ketika confidence rendah atau ada konflik. `/hari-ini` masih berupa layar persiapan; mesin penjadwalan, Groq, kalender, dan sesi belajar belum dibuat.
