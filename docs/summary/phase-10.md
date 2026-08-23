# Fase 10 — Google Calendar

## Hasil

Planify kini memiliki sinkronisasi satu arah yang dikelola aplikasi. `src/features/calendar/provider.ts` memetakan sesi belajar ke event Google bertimezone setup pengguna, memberi metadata private `planifyManaged`, lalu hanya `insert` untuk sesi masa depan tanpa link, `update` setelah GET dan verifikasi metadata/session key pada link durable, dan `delete` setelah verifikasi yang sama. Link aktif yang korup dibuat ulang/repoint ke ID deterministik; event eksternal atau event Planify untuk sesi lain tidak pernah diubah atau dihapus.

Batas masa depan menggunakan tanggal lokal dan waktu akhir sesi (`date > hari ini` atau `date === hari ini && endTime > HH:mm lokal`), sehingga sesi yang sudah berakhir pada hari yang sama tidak disentuh dan tautan historis tetap dipertahankan oleh sinkronisasi biasa. Disconnect memakai helper verifikasi yang sama: hanya event Planify mendatang dihapus, sementara link/koneksi lokal tetap dapat dilepas untuk event unmanaged atau hilang; cascade disconnect memang menghapus mapping lokal.

`src/features/calendar/crypto.ts` memakai AES-256-GCM dengan IV acak dan authentication tag. Nilai yang disimpan hanya ciphertext berformat versi; kunci dibaca dari `CALENDAR_TOKEN_ENCRYPTION_KEY` server-side. `oauth.ts` membatasi scope ke `https://www.googleapis.com/auth/calendar.events`, menguji state/token exchange/refresh, dan mempertahankan refresh token lama ketika Google tidak mengirim token baru.

Route OAuth memakai cookie state HttpOnly, SameSite=Lax, TTL 10 menit, verifikasi constant-time, dan callback tepat `/api/auth/google/callback`. `calendar.ts` memuat status aman tanpa ciphertext, menyegarkan access token saat perlu, menyinkronkan sesi, memperbarui durable links, menandai kegagalan tanpa mengubah rencana belajar, serta menyediakan lepas koneksi. `/profil` menjelaskan status, sambungkan, sinkronkan/ulang, dan lepas koneksi; demo atau belum masuk menjelaskan kebutuhan akun.

## Database dan verifikasi remote

Migration `20260823083352_phase_10_calendar_sync.sql` membuat `calendar_connections` dan `calendar_event_links`, FK/unique/index yang diperlukan, RLS authenticated ownership dengan `(select auth.uid())` dan USING/WITH CHECK, serta revoke `anon`. Migration koreksi `20260823084407_phase_10_calendar_security.sql` menegaskan kepemilikan `study_session_id` pada UPDATE `WITH CHECK` setelah review remote. Keduanya dibuat melalui `supabase migration new`.

- Initial dry-run remote: hanya `20260823083352_phase_10_calendar_sync.sql`; corrective dry-run after review: `upToDate=true`, tidak ada migration tertunda.
- Push remote: berhasil.
- Migration list: local/remote selaras dari `202608230001` hingga `20260823084407` (termasuk corrective security migration).
- Catalog read-only: kedua tabel ada, RLS aktif, seluruh PK/unique/FK/index dan policies ownership terdeteksi; `anon` tidak memiliki table grants. Policy UPDATE `WITH CHECK` remote memuat pemeriksaan `study_sessions.user_id = (select auth.uid())`.
- `supabase db lint --linked`: tidak ada schema errors.
- `supabase db advisors --linked --type all --fail-on error`: tidak ada error; hanya warning lama Fase 1–4 dan `public.rls_auto_enable()`.

## Verifikasi aplikasi

- `npm test`: 45/45 lulus (crypto tamper, OAuth state/refresh, mapping, deterministic retry, ownership verification/repoint, same-day future boundary, disconnect helper, create/update/delete/failure boundary).
- `npm run typecheck`: lulus.
- `npm run lint`: lulus.
- `npm run build`: lulus dengan `/profil` dan route OAuth.
- `git diff --check`: lulus.

## Batasan

Belum ada webhook dua arah atau sinkronisasi perubahan dari Google ke Planify; itu sengaja di luar model managed one-way fase ini. Account email tidak diambil karena scope kalender saja tidak meminta identitas tambahan.
