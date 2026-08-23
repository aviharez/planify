# Planify

Planify adalah prototipe teman belajar mobile-first untuk mahasiswa Indonesia. Repositori ini mencakup Fase 1 dan Fase 2: fondasi aplikasi dan onboarding enam langkah.

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env.local
npm run dev
```

Buka `http://localhost:3000`. Tanpa kredensial, pilih **Coba mode demo**. Progres onboarding disimpan di `localStorage`, sehingga menutup atau memuat ulang halaman akan melanjutkan dari langkah terakhir.

Jika Supabase tersedia, isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` di `.env.local`. Jalankan migrasi `supabase/migrations/202608230001_phase_1_2.sql`, lalu gunakan daftar/masuk dengan email dan kata sandi. Progres tersimpan di `semesters.setup_payload` dan dimuat kembali saat sesi dipulihkan. Kunci rahasia server tidak boleh diberi awalan `NEXT_PUBLIC_`.

## Alur demo

1. Pilih **Gunakan KRS contoh** untuk tujuh mata kuliah dan 21 SKS, atau unggah PDF/JPG/JPEG/PNG maksimal 10 MB.
2. Periksa, ubah, tambah, atau hapus mata kuliah.
3. Isi jadwal kuliah dan waktu belajar yang tersedia.
4. Isi kebiasaan belajar singkat.
5. Nilai pemahaman dan kesulitan setiap mata kuliah secara terpisah; agenda akademik bersifat opsional.
6. Periksa ringkasan, lalu pilih **Buat Rencana Belajar** untuk membuka layar siap dan handoff `/hari-ini`.

## Pemeriksaan

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Batasan Fase 1–2

Ekstraksi KRS saat ini adalah mock yang terlihat jelas oleh pengguna. Migrasi hanya mencakup data fondasi dan onboarding: profil, semester, dokumen KRS, mata kuliah, pendaftaran, jadwal kuliah, ketersediaan, kebiasaan, evaluasi, dan agenda akademik, termasuk RLS serta bucket KRS privat. Belum ada OCR/PDF parsing sungguhan, mesin prioritas, mesin penjadwalan, Groq, kalender, mode luring, atau fitur utama setelah onboarding. `/hari-ini` adalah layar handoff minimal yang hanya dapat dibuka ketika `planActive` valid di state demo atau setup aktif Supabase; navigasi utama dan sesi belajar belum dibuat.
