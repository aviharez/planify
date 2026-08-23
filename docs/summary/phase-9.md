# Fase 9 — Progres

## Hasil

`/progres` memakai rencana aktif yang sama dengan pengalaman utama dan menambahkan navigasi bersama ke Hari Ini, Rencana, Mata Kuliah, Progres, dan Profil. Halaman memakai bento desktop 12 kolom (6+6 lalu 4+4+4), satu kolom di mobile, dan fokus pada keterjagaan rencana, menit selesai, jumlah sesi, konsistensi hari, sinyal perhatian, cerita per mata kuliah, serta langkah belajar berikutnya.

`src/features/progress/metrics.ts` menghitung minggu Senin–Minggu secara deterministic. Menit selesai hanya menjumlahkan sesi `completed`; sesi `partial` tidak diberi menit fiktif. Metrik mencakup planned/completed minutes, completed/missed/partial/planned counts, adherence sesi yang sudah jatuh tempo, konsistensi hari, waktu per mata kuliah, sinyal peningkatan berbasis dua minggu feedback, dan sinyal perhatian berbasis sesi belum selesai atau pemahaman rendah. Empty state menjelaskan bahwa catatan belum cukup.

Data remote hanya mengambil field feedback yang diperlukan (`study_session_id`, alasan, pemahaman, waktu catat) dan memakai catatan terbaru per sesi. Demo/local tetap memakai payload localStorage yang tervalidasi.

## Verifikasi

- `npm test`: 31/31 lulus.
- `npm run typecheck`: lulus.
- `npm run lint`: lulus.
- `npm run build`: lulus; route baru `/progres` ter-build.
- Tidak ada migrasi database baru; tabel `study_sessions` dan `session_feedback` Fase 7 sudah cukup.

## Batasan

Sinyal peningkatan hanya muncul bila ada feedback pemahaman pada minggu ini dan minggu sebelumnya. Tanpa data tersebut UI sengaja tidak menebak tren.
