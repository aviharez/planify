# Rencana Implementasi Fase 9–11

## Batas dan arsitektur

- Fase 9 memakai `StudyPlan`/`StudySession` yang sudah ada dan feedback sesi yang dibatasi; kalkulasi murni dan dapat diuji di `src/features/progress` serta memuat data feedback remote secukupnya.
- Fase 10 menambah boundary Google Calendar berbasis `fetch`/Web Crypto, dua tabel Supabase baru dengan RLS ownership, OAuth callback tepat di `/api/auth/google/callback`, dan permukaan Kalender di Profil. Token terenkripsi hanya server-side.
- Fase 11 menyelesaikan polish shell, manifest/icon native Next, error/loading/404 surfaces, security headers, deployment documentation, dan Playwright E2E lokal/demo dengan fixture `download.pdf`.

## Kendala yang dipertahankan

- Semua copy terlihat pengguna natural Bahasa Indonesia; tanggal memakai `id-ID` dan timezone setup.
- Demo/local mode tetap berjalan tanpa Supabase atau Google; kegagalan Calendar tidak mengubah rencana belajar.
- Tidak menambah service-role dependency, offline sync lanjutan, sinkronisasi dua arah, atau manual deploy Vercel.
- Event hanya dibuat, diperbarui, dan dihapus jika link durable milik aplikasi ada; event eksternal tidak pernah disentuh.
- Migrasi imperative mengikuti `supabase migration new`, lalu dry-run/push/list/catalog/advisor read-only checks.

## Kriteria sukses

- `/progres` punya insight actionable, empty states jujur, metrik deterministic yang dites, dan entry nav bersama `/profil`.
- OAuth state cookie aman, refresh token dipertahankan saat Google tidak mengirim token baru, ciphertext tervalidasi AEAD, dan CRUD event teruji dengan HTTP mock.
- Installability, responsive/a11y/reduced-motion/error states, env/README readiness, dan E2E setup berbasis PDF benar-benar runnable.
- Setiap fase memiliki ringkasan, verifikasi proporsional, dan commit terpisah: `feat: implement phase 9 progress`, `feat: implement phase 10 calendar sync`, `feat: complete phase 11 production polish`.
