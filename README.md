# Planify

Planify adalah teman belajar mobile-first untuk mahasiswa Indonesia. Aplikasi ini mencakup onboarding enam langkah dengan pemrosesan KRS di browser, rencana belajar empat minggu, tampilan Hari Ini, dan sinkronisasi satu arah ke Google Calendar.

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env.local
npm run dev
```

Buka `http://localhost:3000`. Masuk atau buat akun dengan konfigurasi Supabase; tanpa konfigurasi aplikasi menampilkan pesan konfigurasi yang jelas.

Isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` di `.env.local`, lalu jalankan migrasi melalui alur CLI Supabase. Akun dapat menyimpan onboarding, rencana aktif, dan koneksi kalender. Kunci rahasia server tidak boleh diberi awalan `NEXT_PUBLIC_`.

Catatan kompatibilitas: migrasi maju dan normalizer payload mempertahankan referensi schema lama hanya untuk memigrasikan data tersimpan; referensi tersebut bukan default produk atau jalur UI.

## Alur onboarding

1. Unggah PDF/JPG/JPEG/PNG maksimal 10 MB. PDF digital dibaca langsung; PDF pindaian dan gambar diproses dengan OCR Bahasa Indonesia di browser. Jika perlu, pilih **Isi mata kuliah secara manual**.
2. Periksa, ubah, tambah, atau hapus mata kuliah.
3. Isi jadwal kuliah dan waktu belajar yang tersedia.
4. Isi kebiasaan belajar singkat.
5. Nilai pemahaman dan kesulitan setiap mata kuliah secara terpisah; agenda akademik bersifat opsional.
6. Periksa ringkasan, lalu pilih **Buat Rencana Belajar** untuk menghitung rencana deterministik dan membuka `/hari-ini`.

## Pemeriksaan

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit --audit-level=high
```

## Deployment dan variabel lingkungan

Di Vercel, hubungkan repositori GitHub ke project agar deployment berjalan otomatis dari branch yang dipilih. Tidak ada langkah deploy manual yang diperlukan di repositori ini.

Variabel yang perlu disiapkan di environment Vercel:

- `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` untuk akun dan penyimpanan.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, dan `CALENDAR_TOKEN_ENCRYPTION_KEY` untuk Google Calendar. Callback harus berakhir tepat di `/api/auth/google/callback`.
- `GROQ_API_KEY` dan `GROQ_MODEL` opsional untuk pengayaan rencana; rencana deterministik tetap dapat dibuat tanpa keduanya.

Tambahkan URL callback produksi yang sama ke Google OAuth client. Kunci kalender harus berupa kunci acak 32 byte dalam base64url atau 64 karakter hex; jangan pernah menaruhnya di variabel `NEXT_PUBLIC_*`.

Pemrosesan OCR membutuhkan unduhan model Tesseract pertama kali dan berjalan di Web Worker. Sinkronisasi kalender hanya satu arah untuk event Planify yang akan datang; sinkronisasi offline lanjutan belum termasuk.
