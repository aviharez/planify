# Phase 8 — Adaptasi

## Batas dan hasil

Phase ini menambahkan adaptasi rencana berbasis sinyal deterministik dari sesi selesai sebagian, sesi yang tidak sempat, pemahaman rendah, tenggat akademik, dan evaluasi mingguan. Tidak ada panggilan Groq pada keputusan atau penjadwalan adaptasi. Progres, kalender, dan analitik lanjutan tetap di luar batas fase ini.

## Arsitektur dan invariants

- `src/features/planning/adaptation.ts` menghitung sinyal per mata kuliah dengan batas 0,35, membangun ulang snapshot prioritas Phase 4, lalu menggunakan `generateStudyPlan` Phase 5 untuk mencari slot yang valid.
- Sesi historis dan sesi selesai tidak diubah. Sesi terjadwal masa depan dipertahankan sebisa mungkin; penambahan hanya memakai slot yang tidak bentrok dengan ketersediaan, jadwal kelas, sesi lain, jeda minimum, batas harian, dan kapasitas mingguan.
- Sinyal beban berat atau rencana yang tidak realistis menurunkan kapasitas adaptasi menjadi 80%; kondisi ringan dan realistis hanya menaikkannya secara terbatas sampai 75% capacity factor. Tidak ada hukuman berupa beban berlebihan.
- Hasil menyimpan alasan berbahasa Indonesia, daftar perubahan, `sourcePlanId`, dan `sourceSessionId`. Tidak ada perubahan yang diam-diam dilakukan ketika tidak tersedia slot.

## Persistence dan keamanan

Migration `20260823074247_phase_8_adaptation.sql` menambahkan lineage dan alasan pada `study_plans`/`study_sessions`, indeks lineage, serta `weekly_evaluations`. Grant untuk `anon` dicabut dan grant eksplisit `authenticated` dipertahankan. RLS mengecek kepemilikan semester dan menggunakan fungsi `security definer` dengan `search_path` tetap untuk memvalidasi plan/session lineage tanpa rekursi policy.

`saveWeeklyEvaluation` memvalidasi payload, sesi aktif, dan course key dari setup milik pengguna. `persistAdaptedPlan` memvalidasi ulang snapshot, policy, rentang tanggal, durasi, status, dan daftar sesi di server; membuat versi plan baru, menautkan lineage, lalu mengarsipkan plan sumber. Local/demo memakai localStorage yang sama dengan pengalaman utama.

## UX

`Rencana` sekarang menyediakan evaluasi mingguan dengan perceived load 1–5, realism, dan mata kuliah opsional. Ketika ada perubahan, UI menampilkan “Rencanamu Diperbarui” beserta alasan dan daftar perubahan. Empty/no-slot state menjelaskan bahwa beban dijaga. Semua label, status, pesan validasi, dan aksi memakai Bahasa Indonesia; kontrol evaluasi menggunakan button state yang dapat dibaca assistive technology.

## Verifikasi

- `npm test`: **27/27 lulus**.
- `npm run typecheck`: **lulus**.
- `npm run lint`: **lulus**.
- `npm run build`: **lulus**; route Phase 7 tetap ter-build.
- `npm audit --audit-level=high`: **0 kerentanan**.
- `git diff --check`: **lulus**.
- `supabase db push --dry-run`: tidak dapat dijalankan karena workspace tidak memiliki project ref (`LegacyProjectNotLinkedError`).
- `supabase db lint --local`: tidak dapat dijalankan karena database lokal/Docker tidak aktif (`ECONNREFUSED 127.0.0.1:54322`). SQL migration sudah ditinjau statis; verifikasi remote memerlukan linked project yang tersedia.

## Keterbatasan tersisa

Versi plan baru menyimpan salinan sesi historis pada plan aktif agar tampilan tetap lengkap, sementara plan sumber tetap diarsipkan sehingga riwayat database tidak dihapus. Feedback lama tetap melekat pada sesi sumber; tampilan utama belum memuat histori feedback lintas versi. Evaluasi mingguan lokal tidak disimpan sebagai tabel terpisah sampai pengguna terautentikasi, tetapi hasil adaptasinya tetap tersimpan pada plan lokal.
