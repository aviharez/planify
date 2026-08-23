# Adaptive Study Planner — Greenfield Build Brief

## 1. Project Goal

Build a **mobile-first adaptive study planner for university students in Indonesia**.

This is a completely new project.

Do not assume any previous implementation, architecture, database schema, or UI exists.

The application helps a student:

1. upload their KRS,
2. extract and verify enrolled courses,
3. describe their weekly schedule and study habits,
4. evaluate their current condition for each course,
5. generate a personalized four-week study plan,
6. follow the plan day by day,
7. record study progress,
8. automatically adapt future sessions based on actual progress,
9. optionally synchronize generated sessions to Google Calendar.

The core product loop is:

```text
SIAPKAN
   ↓
RENCANAKAN
   ↓
BELAJAR
   ↓
EVALUASI
   ↓
SESUAIKAN
   ↓
RENCANAKAN LAGI
```

The product must feel like a **personal study companion**, not a university administration dashboard and not an AI chatbot.

---

# 2. Critical Language Requirement

## ALL USER-FACING APPLICATION WORDING MUST USE BAHASA INDONESIA

This is a strict requirement.

Every visible application string must be written in natural Bahasa Indonesia, including:

- navigation
- page titles
- buttons
- form labels
- form descriptions
- onboarding questions
- validation errors
- toast messages
- dialogs
- empty states
- loading states
- success states
- AI-generated explanations
- AI-generated study goals
- AI-generated study strategies
- calendar labels
- progress information
- accessibility labels where user-facing

Do NOT mix English UI wording into the application.

For example, do NOT use:

```text
Today
Plan
Courses
Progress
Start Session
Check-in
Generate Plan
Study Habits
```

Use:

```text
Hari Ini
Rencana
Mata Kuliah
Progres
Mulai Belajar
Evaluasi
Buat Rencana
Kebiasaan Belajar
```

Proper names such as:

- Groq
- Google Calendar
- GPT OSS 120B
- Supabase

may remain unchanged.

Code, database columns, TypeScript identifiers, comments, and technical logs may use English.

Format dates using Indonesian locale:

```ts
id-ID
```

Example:

```text
Senin, 24 Agustus 2026
```

Detect and persist the user's timezone rather than hardcoding one timezone globally.

---

# 3. Product State Model

The application has two major states.

## State A — Setup Belum Selesai

A user who does not yet have an active study plan must go through the guided setup wizard.

They must NOT see the normal main application navigation yet.

```text
Daftar / Masuk
      ↓
Apakah sudah memiliki rencana aktif?
      │
      ├── Belum
      │     ↓
      │  Setup Wizard
      │
      └── Sudah
            ↓
         Hari Ini
```

## State B — Rencana Aktif

After generation succeeds, the student enters the main application.

The primary destination becomes:

```text
Hari Ini
```

---

# 4. First-Time User Journey

The first-time experience must follow exactly this mental model:

```text
Daftar / Masuk
      ↓
KRS
      ↓
Mata Kuliah
      ↓
Jadwal Mingguan
      ↓
Kebiasaan Belajar
      ↓
Evaluasi Mata Kuliah
      ↓
Ringkasan
      ↓
Buat Rencana
      ↓
Rencana Belajar Siap
      ↓
Hari Ini
```

This flow must be obvious without requiring explanation from another person.

---

# 5. Setup Wizard

Use a guided stepper.

Use exactly six major steps:

```text
1. KRS
2. Mata Kuliah
3. Jadwal Mingguan
4. Kebiasaan Belajar
5. Evaluasi Mata Kuliah
6. Ringkasan
```

Desktop can display all labels.

Mobile may display:

```text
Langkah 3 dari 6

Jadwal Mingguan

━━━━━━━━━━━────────
```

Do not force all six labels into a narrow mobile screen.

The setup wizard must be resumable.

Persist progress in the database after each step.

Refreshing or closing the browser must not destroy progress.

---

# 6. Step 1 — KRS

## Purpose

Explain clearly:

```text
Mari mulai dari KRS kamu

Kami akan menggunakan KRS untuk mengetahui
mata kuliah dan beban studi yang kamu ambil
semester ini.
```

Primary actions:

```text
Unggah KRS
```

Mobile alternatives:

```text
Ambil Foto

Pilih dari Galeri

Pilih PDF
```

Supported formats:

- PDF
- scanned PDF
- JPG
- JPEG
- PNG

Show accepted file information clearly.

---

# 7. KRS Processing Experience

After upload:

```text
Membaca KRS kamu...

Sedang mencari mata kuliah yang kamu ambil.
```

If necessary, show real processing stages:

```text
✓ Dokumen berhasil dibaca
○ Mengenali mata kuliah
○ Menyiapkan hasil
```

Do not expose technical wording such as:

- OCR engine
- parsing pipeline
- LLM extraction
- JSON processing

to normal users.

---

# 8. KRS Extraction Architecture

GPT OSS 120B must NOT receive the raw image as an OCR system.

Use:

```text
PDF / Gambar
      ↓
Ekstraksi Dokumen
      ↓
Teks Mentah
      ↓
Normalisasi
      ↓
Ekstraksi Mata Kuliah
      ↓
Deduplikasi
      ↓
Data Kandidat
      ↓
Verifikasi Pengguna
```

Create a clear domain abstraction:

```text
KrsExtractionService
```

---

# 9. Digital PDF Processing

If a PDF already contains embedded/selectable text:

```text
PDF
 ↓
PDF Text Extraction
 ↓
Normalize
```

Do not perform OCR unnecessarily.

Use a serverless-compatible JavaScript PDF extraction solution.

---

# 10. Image / Scanned Document Processing

For images or scanned documents, use OCR before parsing.

Design OCR behind an interface:

```ts
interface OcrProvider {
  extractText(input: OcrInput): Promise<OcrResult>
}
```

The initial implementation should favor a solution that:

- works with Vercel/serverless deployment,
- does not require a permanently running worker,
- is practical for a thesis prototype,
- can later be replaced without changing domain logic.

If browser-side OCR with a Web Worker is used, make sure the user sees actual progress and the UI remains responsive.

Do not couple OCR logic directly to React components.

---

# 11. KRS Course Extraction

After raw text exists, transform it into structured course candidates.

Extract when available:

```text
Periode akademik
Kode mata kuliah
Nama mata kuliah
Semester
SKS
Status
Jumlah mata kuliah
Jumlah SKS
```

Example domain result:

```json
{
  "periodeAkademik": "Ganjil 2024/2025",
  "jumlahSks": 21,
  "mataKuliah": [
    {
      "kode": "IF-015",
      "nama": "Pemrograman Berorientasi Objek I",
      "semester": 3,
      "sks": 3,
      "status": "Approved"
    }
  ]
}
```

The implementation may use:

1. deterministic parsing first,
2. Groq structured extraction as fallback or normalization assistance.

Groq must receive text, not the original image.

---

# 12. KRS Deduplication

Real KRS documents may contain duplicated sections.

The provided reference KRS, for example, contains two copies of the course table on the same page.

Deduplicate using combinations such as:

```text
course code
+
normalized course name
+
SKS
```

Never silently merge conflicting records.

If values differ, mark them for verification.

---

# 13. Extraction Confidence

Where practical, track extraction confidence.

Example:

```text
confidence: 0.96
```

Low-confidence fields should receive more visual attention during verification.

Do not present uncertain OCR results as guaranteed truth.

---

# 14. Extraction Failure

If reading fails:

```text
KRS belum berhasil dibaca

Coba unggah foto yang lebih jelas atau
masukkan mata kuliah secara manual.

[ Coba Lagi ]

[ Isi Manual ]
```

Manual entry is mandatory as fallback.

KRS extraction failure must never block the product completely.

---

# 15. Step 2 — Mata Kuliah

Purpose:

> Verify that the KRS was interpreted correctly.

Example:

```text
Kami menemukan 7 mata kuliah

Pastikan data berikut sudah benar sebelum
melanjutkan.

────────────────────────

IF-015

Pemrograman Berorientasi Objek I

3 SKS

[ Ubah ]

────────────────────────

IF-005

Basis Data Terdistribusi

3 SKS

[ Ubah ]

────────────────────────

7 Mata Kuliah · 21 SKS

[ + Tambah Mata Kuliah ]

[ Lanjutkan ]
```

Allow:

- add
- edit
- remove
- change code
- change name
- change SKS
- change semester if relevant

Nothing becomes final until the student confirms it.

---

# 16. Step 3 — Jadwal Mingguan

This step captures two different concepts on one screen/step:

1. Jadwal Kuliah
2. Waktu Belajar Tersedia

Do not make these separate wizard steps.

---

# 17. Jadwal Kuliah

Ask:

```text
Kapan jadwal kuliah kamu?

Kami tidak akan menjadwalkan waktu belajar
yang bertabrakan dengan jadwal kuliah.
```

For every course, allow one or more schedules:

```text
Sistem Operasi

Rabu
10.00 – 12.30
```

Action:

```text
+ Tambah Jadwal
```

Class schedule should behave as a hard scheduling constraint.

---

# 18. Waktu Belajar Tersedia

Ask:

```text
Kapan kamu biasanya punya waktu untuk belajar?
```

Example:

```text
Senin
19.00 – 22.00

Selasa
20.00 – 22.00

Sabtu
09.00 – 13.00
```

Support quick presets when helpful:

```text
Malam Hari Kerja

Pagi Akhir Pekan

Atur Sendiri
```

Users must be able to customize everything after using a preset.

Availability is a hard constraint.

---

# 19. Mobile Weekly Schedule UX

Do not make users manage a spreadsheet-like schedule on mobile.

Prefer:

- day chips
- time-range picker
- clear add/remove interaction
- visual summary
- large touch targets

Example:

```text
Sen   Sel   Rab   Kam   Jum   Sab   Min
 ●           ●               ●

Senin

19.00 — 22.00

[ + Tambah Waktu ]
```

---

# 20. Step 4 — Kebiasaan Belajar

Keep this intentionally short.

Do not create a long psychological questionnaire.

Only capture information useful for scheduling.

---

## Waktu Fokus

```text
Kapan kamu biasanya paling fokus?

○ Pagi
○ Siang
● Sore
● Malam
```

Allow more than one answer.

---

## Durasi Fokus

```text
Berapa lama kamu biasanya bisa fokus dalam satu sesi?

○ 25 menit
● 45 menit
○ 60 menit
○ 90 menit
```

---

## Kepadatan Aktivitas

```text
Seberapa padat aktivitasmu bulan ini?

Sangat Longgar
Cukup Longgar
Seimbang
Padat
Sangat Padat
```

This should influence how much of the theoretical availability is actually filled.

Do not fill every free minute with study sessions.

---

## Kebiasaan Menunda

Use non-judgmental wording:

```text
Seberapa sering kamu menunda waktu belajar?

Jarang
Kadang-kadang
Sering
Sangat Sering
```

This can influence scheduling strategy.

For example, frequent procrastination may favor:

- shorter sessions,
- earlier sessions before deadlines,
- more spacing,
- smaller goals.

Do not label or diagnose users.

---

# 21. Step 5 — Evaluasi Mata Kuliah

The goal is:

> Identify which courses currently need the most attention.

Present one course at a time on mobile.

Example:

```text
2 dari 7 Mata Kuliah

Sistem Operasi
3 SKS

Seberapa paham kamu dengan mata kuliah ini?

Sangat Tidak Paham             Sangat Paham

1     2     3     4     5
            ●
```

Then:

```text
Menurutmu, seberapa sulit mata kuliah ini?

Sangat Mudah                       Sangat Sulit

1     2     3     4     5
                  ●
```

Understanding and perceived difficulty are different variables.

Do not merge them.

---

# 22. Agenda Akademik Per Mata Kuliah

On the same course evaluation step, optionally ask:

```text
Ada tugas, kuis, atau ujian yang akan datang?
```

Actions:

```text
+ Tambah Tugas

+ Tambah Kuis

+ Tambah Ujian

+ Tambah Agenda Lain
```

Academic event fields:

```text
Mata Kuliah
Jenis
Judul
Tanggal
Tingkat Kepentingan
Catatan
```

Possible types:

```text
Tugas
Kuis
UTS
UAS
Presentasi
Proyek
Lainnya
```

Agenda is optional during setup.

Users can add more later.

---

# 23. Step 6 — Ringkasan

Do not immediately call the AI after the final questionnaire.

Show a review screen first.

Example:

```text
Semua Sudah Siap

Berikut informasi yang akan digunakan untuk
membuat rencana belajarmu.

────────────────────────

Semester

Ganjil 2024/2025

7 Mata Kuliah · 21 SKS

────────────────────────

Waktu Fokus

Malam

Durasi Belajar

45 menit per sesi

Waktu Tersedia

12 jam per minggu

────────────────────────

Perlu Perhatian Lebih

1. Sistem Operasi
2. Teori Bahasa Otomata
3. Basis Data Terdistribusi

────────────────────────

Agenda Terdekat

UTS Sistem Operasi
12 hari lagi

────────────────────────

[ Buat Rencana Belajar ]
```

Every section should allow:

```text
Ubah
```

to jump back to the relevant step.

Generation must be an explicit user action.

---

# 24. Plan Generation Experience

After:

```text
Buat Rencana Belajar
```

show a dedicated state.

Example:

```text
Sedang menyusun rencana belajarmu...

✓ Menghitung beban studi
✓ Menentukan prioritas mata kuliah
✓ Mencari waktu belajar yang sesuai
○ Menyiapkan strategi belajar
```

Only display stages that correspond to real processing.

Do not artificially delay completion.

---

# 25. Core Planning Architecture

The plan must NOT be generated using one giant LLM prompt.

Do NOT implement:

```text
KRS
+
Kuesioner
+
"Buatkan jadwal satu bulan"
       ↓
      LLM
```

Instead:

```text
Mata Kuliah
      +
SKS
      +
Jadwal Kuliah
      +
Waktu Tersedia
      +
Kebiasaan Belajar
      +
Pemahaman
      +
Kesulitan
      +
Agenda Akademik
          ↓
   Priority Engine
          ↓
   Scheduling Engine
          ↓
  Study Sessions
          ↓
     Groq
GPT OSS 120B
          ↓
AI Enrichment
```

---

# 26. Priority Engine

Build deterministic course priority calculation.

Initial components:

```text
Beban Akademik
Kesenjangan Pemahaman
Kesulitan
Urgensi
Sinyal Adaptasi
```

Suggested initial configurable weights:

```text
Beban Akademik        20%
Kesenjangan Pemahaman 30%
Kesulitan             20%
Urgensi                25%
Sinyal Adaptasi         5%
```

Do not hardcode these throughout the codebase.

Store them in a centralized configuration/domain policy.

---

# 27. Priority Normalization

Normalize factors to a comparable range.

Conceptually:

```text
Knowledge Gap

1 - normalized understanding
```

Higher difficulty means higher priority.

Higher academic load means somewhat higher priority.

Closer important deadlines increase urgency.

Repeated missed sessions may increase attention, but should not create an unrealistic workload.

Store the factor breakdown.

Example internal data:

```json
{
  "academicLoad": 0.6,
  "knowledgeGap": 0.8,
  "difficulty": 0.8,
  "urgency": 0.9,
  "adaptation": 0.2,
  "finalScore": 0.76
}
```

This is required for explainability and thesis evaluation.

---

# 28. Scheduling Engine

The scheduling engine must be deterministic and independently testable.

It controls:

- date
- start time
- end time
- duration
- course allocation
- conflict detection
- study distribution

Groq does NOT control these fields.

---

# 29. Hard Constraints

Never violate:

- user availability
- class schedule
- overlapping sessions
- valid planning period
- maximum session duration
- completed historical sessions

Add sensible configurable rules for:

- maximum study minutes per day,
- minimum break between long sessions,
- minimum spacing where practical.

---

# 30. Soft Preferences

Optimize for:

- preferred focus periods,
- higher priority subjects during stronger focus periods,
- spacing sessions across the week,
- balancing difficult courses,
- avoiding excessively packed days,
- studying sufficiently before deadlines.

Use scoring rather than absolute requirements for these.

---

# 31. Weekly Study Capacity

Do not use every available minute.

Calculate a safe weekly study budget from:

```text
Availability
×
Activity Density
×
Reasonable Capacity Policy
```

A student who marks:

```text
Sangat Padat
```

should receive a lighter plan than a student with identical availability who selects:

```text
Cukup Longgar
```

---

# 32. Four-Week Planning Horizon

The first generation creates a plan for approximately the next four weeks.

However, do not treat all four weeks as equally rigid.

Use:

```text
Minggu Ini
= detailed and active

Minggu Berikutnya
= planned but adaptable
```

The current week is the primary execution unit.

Future weeks may change as new information appears.

---

# 33. Study Session Model

A session should contain deterministic information:

```text
course
date
startTime
endTime
duration
prioritySnapshot
status
```

and optional AI enrichment:

```text
studyMethod
studyGoal
explanation
```

---

# 34. Groq Integration

Use Groq as the LLM provider.

Install and use the official Groq TypeScript SDK unless a clearly better technical reason emerges.

Environment:

```env
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
GROQ_REASONING_EFFORT=medium
```

Never expose the Groq API key to the browser.

All Groq calls happen server-side.

---

# 35. Groq Provider Architecture

Create:

```ts
interface AiProvider {
  enrichStudySessions(
    input: EnrichStudySessionsInput
  ): Promise<EnrichStudySessionsResult>;
}
```

Implementation:

```text
GroqAiProvider
```

Domain services depend on:

```text
AiProvider
```

not directly on Groq SDK calls.

---

# 36. Groq Responsibilities

Use GPT OSS 120B for:

## Strategy belajar

For example:

```text
Latihan Soal
Latihan Implementasi
Active Recall
Membuat Ringkasan
Flashcard
Latihan Konsep
```

When displayed to the user, translate everything naturally into Bahasa Indonesia.

Prefer Indonesian terminology where natural:

```text
Mengingat Aktif
```

instead of exposing English unnecessarily.

---

## Goal generation

Instead of:

```text
Belajar Sistem Operasi
```

generate:

```text
Tinjau kembali materi kuliah terbaru,
lalu coba jelaskan konsep utamanya
tanpa melihat catatan.
```

---

## Human-readable explanation

Example:

```text
Sistem Operasi mendapat lebih banyak sesi
minggu ini karena tingkat pemahamanmu masih
rendah dan jadwal UTS semakin dekat.
```

---

# 37. Groq Must NOT Decide Scheduling

Never ask GPT OSS 120B to choose:

- exact date
- exact time
- duration
- availability
- conflict resolution
- how many total weekly hours are safe

These belong to deterministic application logic.

---

# 38. Structured Outputs

All Groq responses consumed by application logic must use JSON Schema Structured Outputs.

Use strict schema mode for GPT OSS 120B.

Example conceptual response:

```json
{
  "sessions": [
    {
      "sessionKey": "local-generated-key",
      "studyMethod": "Mengingat Aktif",
      "goal": "Tinjau materi terbaru dan jelaskan kembali tanpa melihat catatan.",
      "explanation": "Mata kuliah ini sedang menjadi prioritas karena pemahaman masih rendah."
    }
  ]
}
```

Validate the response again with Zod before using it.

Never trust raw AI output.

---

# 39. Batch Groq Requests

Do not make unnecessary one-request-per-session calls.

Prefer:

```text
8 generated sessions
        ↓
1 Groq enrichment request
        ↓
8 enrichment results
```

Map using local temporary keys.

Never send database credentials or sensitive data to the model.

Never let the model invent database IDs.

---

# 40. Indonesian AI Output

Every Groq system prompt used for user-facing generation must explicitly require:

```text
Respond entirely in natural Bahasa Indonesia.

Do not use English unless it is a proper noun,
course-specific technical term, or has no natural
Indonesian equivalent.
```

AI-generated output that fails the language requirement should not be shown blindly.

---

# 41. AI Failure Fallback

Groq must be optional to plan validity.

If:

```text
Priority Engine ✓
Scheduling Engine ✓
Groq ✕
```

the study plan still exists.

Fallback:

```text
Sistem Operasi

45 menit

Tinjau kembali materi kuliah terbaru dan
latih pemahamanmu.
```

AI enrichment may be retried later.

---

# 42. Plan Ready Screen

Do not immediately show a complicated calendar.

After generation:

```text
Rencana Belajarmu Sudah Siap 🎉

4 minggu ke depan telah disiapkan.

Minggu Ini

8 sesi belajar
6 jam 15 menit

Prioritas Utama

Sistem Operasi
Teori Bahasa Otomata

Sesi Berikutnya

Malam ini · 19.30

Sistem Operasi
45 menit

[ Lihat Rencana ]
```

Then offer:

```text
Tambahkan jadwal belajar ke Google Calendar?

[ Hubungkan Google Calendar ]

Nanti Saja
```

Primary final action:

```text
[ Mulai Gunakan Rencana ]
```

which navigates to:

```text
/hari-ini
```

---

# 43. Main Application Navigation

Only show after setup and initial plan generation are complete.

Mobile bottom navigation:

```text
Hari Ini

Rencana

Mata Kuliah

Progres

Profil
```

Do not use English navigation.

---

# 44. Hari Ini — Main Home Screen

This is the application's most important screen.

The main question is:

> Apa yang perlu aku pelajari hari ini?

Example:

```text
Selamat malam

Minggu, 23 Agustus

Progres Hari Ini

1 dari 3 sesi selesai

────────────────────────

SESI BERIKUTNYA

19.30

Sistem Operasi

45 menit

Mengingat Aktif

Tinjau materi kuliah terbaru dan coba
jelaskan kembali konsep utamanya tanpa
melihat catatan.

[ Mulai Belajar ]

────────────────────────

BERIKUTNYA

21.00

Statistika
45 menit

────────────────────────

AGENDA TERDEKAT

Tugas Basis Data

3 hari lagi
```

Do not make analytics the homepage.

---

# 45. Study Session Execution

When:

```text
Mulai Belajar
```

is pressed, show a focused session experience.

Display:

- mata kuliah
- durasi
- tujuan sesi
- metode belajar
- related academic event where applicable

A countdown timer may be provided but is not mandatory for initial implementation.

After the session:

```text
Bagaimana sesi belajarnya?

[ Selesai ]

[ Selesai Sebagian ]

[ Tidak Sempat ]
```

---

# 46. Missed / Partial Feedback

If relevant:

```text
Apa yang membuat sesi ini tidak selesai?

Tidak cukup waktu

Terlalu lelah

Materinya terasa sulit

Lupa

Ada kegiatan mendadak

Lainnya
```

Keep this lightweight.

Do not require lengthy text input.

---

# 47. Understanding Feedback

Occasionally ask:

```text
Setelah belajar tadi, seberapa paham kamu
dengan materinya?

1   2   3   4   5
```

Do not show this after every single session if it becomes annoying.

Use sensible frequency.

---

# 48. Rencana Screen

Mobile default:

```text
Minggu
```

Allow:

```text
Minggu | Bulan
```

Do not squeeze a desktop calendar grid into a phone.

Example mobile:

```text
Sen  Sel  Rab  Kam  Jum  Sab  Min
 ●         ●    ●         ●

Rabu, 26 Agustus

19.00
Sistem Operasi
45 menit

20.15
Pemrograman Berorientasi Objek
45 menit
```

Desktop can use richer calendar layouts.

---

# 49. Mata Kuliah Screen

Each course should show useful status.

Example:

```text
Sistem Operasi

Prioritas
Tinggi

Pemahaman
2 dari 5

Kesulitan
4 dari 5

Minggu Ini
3 sesi · 2 jam 15 menit

Agenda Terdekat
UTS · 12 hari lagi
```

Course detail should support editing:

- understanding
- difficulty
- class schedule
- academic events

---

# 50. Progres Screen

Avoid excessive analytics.

Show actionable information.

Example:

```text
Minggu Ini

Kepatuhan Rencana
82%

Waktu Belajar

7 jam 30 menit
dari 9 jam yang direncanakan

Paling Berkembang

Sistem Operasi
2 → 4

Perlu Perhatian

Teori Bahasa Otomata

2 sesi terlewat
```

Useful metrics:

- completion rate
- planned minutes
- completed minutes
- skipped sessions
- sessions completed
- time per course
- understanding trend
- weekly consistency

---

# 51. Adaptive Rescheduling

This is a core feature.

Example:

```text
Senin

Sistem Operasi
Tidak Sempat

        ↓

Update Remaining Workload

        ↓

Recalculate Priority

        ↓

Find Future Available Slot

        ↓

Update Future Plan
```

Rules:

- never move completed sessions,
- do not rewrite historical data,
- future sessions may change,
- minimize unnecessary schedule changes,
- do not stack excessive study time as punishment,
- preserve reasonable daily workload.

---

# 52. Schedule Change UX

When a meaningful adaptation occurs:

```text
Rencanamu Diperbarui

Karena ada sesi yang terlewat, kami
menyesuaikan beberapa jadwal berikutnya
agar beban belajarmu tetap realistis.

[ Lihat Perubahan ]
```

Avoid silently changing many sessions without explanation.

---

# 53. Evaluasi Mingguan

At the end of each week:

```text
Bagaimana minggu belajarmu?

Sangat Ringan
Ringan
Pas
Berat
Sangat Berat
```

Then:

```text
Apakah jadwal minggu ini terasa realistis?

Ya

Sebagian Besar

Tidak
```

Optionally:

```text
Mata kuliah mana yang perlu lebih diperhatikan
minggu depan?
```

Combine this feedback with actual usage data.

---

# 54. Weekly Adaptation Inputs

Next week's plan may consider:

```text
Completion history
Skipped sessions
Partial sessions
Understanding changes
Weekly evaluation
Upcoming deadlines
Upcoming exams
Updated availability
```

Do not use AI alone to interpret all of this.

Update deterministic priority factors first.

---

# 55. Editing Planning Preferences

After onboarding, users must be able to change:

```text
Jadwal Kuliah
Waktu Belajar
Waktu Fokus
Durasi Sesi
Kepadatan Aktivitas
```

When a major planning input changes:

```text
Preferensi belajarmu berubah

Apakah kamu ingin menyesuaikan jadwal
yang belum dijalankan?

[ Perbarui Rencana ]

[ Pertahankan Rencana ]
```

Do not force the user through the original wizard again.

---

# 56. New Semester

Support:

```text
Profil
  ↓
Mulai Semester Baru
  ↓
Upload KRS Baru
  ↓
Setup Wizard
```

Previous semester data should remain available as history.

---

# 57. Google Calendar Integration

Google Calendar sync is a core feature but optional for users.

Initial scope is one-way managed synchronization:

```text
Aplikasi
   ↓
Google Calendar
```

Support:

- connect Google Calendar,
- create study events,
- update app-owned future events,
- delete app-owned events,
- prevent duplicates.

Store mapping:

```text
studySessionId
googleCalendarEventId
```

Do NOT initially implement:

```text
Google Calendar
      ↓
automatic availability detection
```

and do not implement full bidirectional calendar synchronization.

Those are future enhancements.

---

# 58. Google Calendar Security

Google Calendar authorization happens server-side.

Only request the permissions necessary to manage events required by the feature.

Tokens and refresh credentials must never be exposed to browser JavaScript.

Persist credentials securely.

Do not modify calendar events that were not created by this application.

Calendar integration failure must never invalidate the study plan.

---

# 59. Core Tech Stack

Build using:

```text
Next.js
TypeScript
React
App Router
Tailwind CSS
shadcn/ui
Lucide
Supabase
Groq
Zod
```

Prefer current stable versions compatible with one another.

---

# 60. Next.js Architecture

Use full-stack Next.js.

```text
Next.js
│
├── App Router
├── React Server Components
├── Client Components
├── Server Actions
├── Route Handlers
├── Domain Services
└── Integrations
       ├── Supabase
       ├── Groq
       ├── OCR
       └── Google Calendar
```

Server Components by default.

Client Components only where necessary.

---

# 61. Supabase Responsibilities

Use Supabase for:

```text
PostgreSQL
Authentication
KRS File Storage
```

Do not introduce separate infrastructure for these responsibilities without a strong reason.

---

# 62. Authentication

Initial authentication:

```text
Email
Password
```

Support:

- register
- login
- logout
- password reset
- persistent session

Google Calendar authorization is separate from normal authentication.

A user does not need Google Calendar to use the application.

---

# 63. Database

Suggested entities:

```text
profiles

semesters

krs_documents

courses

course_enrollments

class_schedules

learning_profiles

availability_slots

course_learning_profiles

academic_events

study_plans

study_sessions

session_feedback

weekly_evaluations

planning_snapshots

calendar_connections

calendar_event_links
```

Use database migrations.

Use foreign keys and constraints appropriately.

---

# 64. Planning Snapshot

Whenever a plan or major adaptation is generated, save the important calculation state.

For example:

```text
Priority weights
Course scores
Availability used
Planning period
Weekly capacity
Generation timestamp
Reason for regeneration
```

This is useful for:

- explainability,
- debugging,
- thesis evaluation.

---

# 65. Supabase Row Level Security

Use RLS.

A normal authenticated student must only be able to access their own:

- KRS
- semesters
- schedules
- study sessions
- feedback
- learning data
- calendar integration

Do not rely purely on frontend filtering for authorization.

---

# 66. Supabase Storage

Store KRS documents in a private bucket.

Do not make uploaded academic documents publicly accessible.

Persist only storage references in the database.

---

# 67. Server Actions

Prefer Server Actions for normal application mutations such as:

```text
saveVerifiedCourses()

saveWeeklySchedule()

saveLearningProfile()

saveCourseEvaluation()

generateStudyPlan()

completeStudySession()

skipStudySession()

submitWeeklyEvaluation()
```

Use Route Handlers where HTTP endpoints are more appropriate:

- OAuth callbacks,
- file/external integration endpoints,
- provider callbacks.

---

# 68. Validation

Use Zod at application boundaries.

Validate:

- forms
- uploaded file metadata
- Server Action input
- URL parameters
- KRS extraction result
- Groq output
- Google API data

Never treat external input as trusted.

---

# 69. Suggested Folder Structure

Use a domain-oriented structure.

Example:

```text
src/
├── app/
│   ├── (auth)/
│   ├── (setup)/
│   ├── (main)/
│   └── api/
│
├── components/
│
├── features/
│   ├── krs/
│   ├── onboarding/
│   ├── courses/
│   ├── schedule/
│   ├── planning/
│   ├── study-session/
│   ├── progress/
│   └── calendar/
│
├── server/
│   ├── ai/
│   ├── extraction/
│   ├── planning/
│   ├── services/
│   └── integrations/
│
├── lib/
│
└── types/
```

Do not over-abstract just to match this example.

---

# 70. Mobile-First UI

Primary design viewport:

```text
390px – 430px
```

Then progressively enhance for:

- tablet,
- laptop,
- desktop.

The main daily product experience should be excellent on a phone.

---

# 71. Visual Direction

The application should look like a polished consumer productivity application.

It should feel:

```text
tenang
modern
bersih
personal
fokus
ringan
bersahabat
```

Avoid:

- SIAKAD styling,
- traditional admin dashboard layouts,
- excessive tables,
- huge desktop sidebars,
- excessive gradients,
- glowing "AI" aesthetics,
- chatbot-first UI.

The intelligence should feel embedded in the product.

---

# 72. shadcn/ui Usage

Use shadcn/ui as component infrastructure.

Do NOT ship a generic default shadcn dashboard.

Customize:

- spacing
- typography
- card hierarchy
- navigation
- forms
- stepper
- responsive behavior

to create a coherent product identity.

---

# 73. Accessibility

Ensure:

- adequate contrast,
- keyboard navigation,
- semantic controls,
- visible focus,
- labels for form fields,
- touch targets appropriate for mobile,
- screen reader friendly interactive elements.

---

# 74. PWA

Make the application installable as a PWA if practical.

Support:

- web app manifest,
- icons,
- standalone mode,
- mobile home-screen installation.

Advanced offline synchronization is NOT required.

---

# 75. Loading States

Implement meaningful loading states for:

- authentication
- KRS upload
- KRS extraction
- Groq enrichment
- initial plan generation
- adaptive rescheduling
- Google Calendar synchronization

All visible messages remain in Bahasa Indonesia.

---

# 76. Empty States

Every major page needs an appropriate empty state.

Example:

```text
Belum ada agenda akademik

Tambahkan tugas atau ujian agar kami bisa
menyesuaikan prioritas belajarmu.

[ Tambah Agenda ]
```

Do not leave users staring at blank pages.

---

# 77. Error States

Examples:

```text
Rencana belum berhasil dibuat

Data yang sudah kamu isi tetap tersimpan.

[ Coba Lagi ]
```

or:

```text
Google Calendar belum berhasil disinkronkan

Rencana belajarmu tetap aman dan bisa
digunakan seperti biasa.

[ Coba Sinkronkan Lagi ]
```

---

# 78. Deployment Architecture

Primary deployment target:

```text
Vercel
   ↓
Next.js

Supabase
   ↓
Database
Auth
Storage

Groq
   ↓
GPT OSS 120B

Google
   ↓
Calendar API
```

Avoid infrastructure requiring permanently running servers.

The project should be practical to demonstrate using free or low-cost development tiers where possible.

---

# 79. Environment Variables

Create:

```text
.env.example
```

At minimum account for:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
GROQ_REASONING_EFFORT=medium

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

CALENDAR_TOKEN_ENCRYPTION_KEY=
```

Never put secrets behind:

```text
NEXT_PUBLIC_
```

---

# 80. Research-Friendly Data

This is an undergraduate thesis project.

Architect the system so later research can measure:

```text
schedule adherence
completion rate
planned vs actual study duration
schedule changes
course priority distribution
perceived workload
perceived schedule suitability
user satisfaction
perceived usefulness
```

Do not add a complex researcher dashboard initially.

Just make sure useful data is captured cleanly.

---

# 81. Potential Thesis Evaluation

The architecture should make it possible to compare:

```text
Rencana Statis
vs
Rencana Adaptif
```

For example:

Does adaptive rescheduling improve adherence or perceived suitability?

Do not artificially implement an experiment before core functionality works.

Just avoid architecture that makes later evaluation impossible.

---

# 82. Privacy

This application handles academic and behavioral information.

Follow basic privacy principles:

- only collect information necessary for the product,
- private KRS storage,
- per-user authorization,
- no public academic data,
- no unnecessary AI data sharing,
- avoid sending names/NIM to Groq when not required.

Before sending planning context to Groq, prefer anonymized structured study information.

---

# 83. Seed / Demo Account

Create seed/demo data for development.

Demo scenario should include:

```text
7 mata kuliah
21 SKS

Different:
- understanding scores
- difficulty scores
- class schedules
- availability
- academic deadlines
```

Also provide generated examples of:

- upcoming sessions
- completed session
- skipped session
- adaptation
- weekly evaluation

This lets the entire product be demonstrated without uploading a KRS every time.

---

# 84. Testing

Business-critical logic must have automated tests.

At minimum test:

```text
KRS normalization
KRS deduplication

Priority calculation

Urgency calculation

Availability rules

Class schedule conflicts

Study session conflicts

Daily capacity

Weekly allocation

Session spacing

Adaptive rescheduling

Preservation of completed sessions

Groq schema validation

Setup wizard state transitions

Google Calendar event mapping
```

Tests for planning logic must not make real Groq API calls.

Mock external services.

---

# 85. E2E Critical Flow

Add end-to-end coverage for at least the main journey:

```text
Daftar
  ↓
Unggah KRS
  ↓
Konfirmasi Mata Kuliah
  ↓
Isi Jadwal Mingguan
  ↓
Isi Kebiasaan Belajar
  ↓
Evaluasi Mata Kuliah
  ↓
Ringkasan
  ↓
Buat Rencana
  ↓
Rencana Siap
  ↓
Hari Ini
```

Also test:

```text
Incomplete setup
→ logout
→ login
→ resume correct step
```

and:

```text
Active plan
→ login
→ Hari Ini
```

---

# 86. Out of Scope

Do NOT implement initially:

- campus SIAKAD integration,
- LMS integration,
- automatic assignment scraping,
- AI chatbot,
- social features,
- friends,
- leaderboards,
- gamification,
- native Android app,
- native iOS app,
- full offline mode,
- automatic Google Calendar availability detection,
- full bidirectional Google Calendar sync,
- multi-semester predictive AI,
- automatic syllabus topic extraction.

Protect the core experience from feature creep.

---

# 87. Development Phases

Do NOT implement everything simultaneously.

---

## Phase 1 — Foundation

Implement:

- Next.js project
- TypeScript
- Tailwind
- shadcn/ui
- Supabase
- authentication
- database migrations
- RLS
- route structure
- Indonesian localization rule
- basic responsive layout

---

## Phase 2 — Complete Setup Wizard UI

Implement:

```text
KRS
→ Mata Kuliah
→ Jadwal Mingguan
→ Kebiasaan Belajar
→ Evaluasi Mata Kuliah
→ Ringkasan
```

Use mock extraction initially if necessary.

The user flow must be excellent before investing heavily in AI.

---

## Phase 3 — KRS Processing

Implement:

- uploads
- private storage
- PDF extraction
- image OCR
- course extraction
- deduplication
- confidence handling
- manual fallback
- verification

Test using realistic KRS documents.

---

## Phase 4 — Priority Engine

Implement and test:

- normalized factors
- configurable weights
- urgency
- knowledge gap
- difficulty
- SKS
- planning snapshots

No Groq dependency.

---

## Phase 5 — Scheduling Engine

Implement:

- weekly capacity
- availability
- class conflict prevention
- daily limits
- session allocation
- session distribution
- four-week planning horizon

No Groq dependency.

---

## Phase 6 — Groq

Implement:

- GroqAiProvider
- GPT OSS 120B
- Structured Outputs
- Zod validation
- batch enrichment
- Bahasa Indonesia enforcement
- graceful fallback

---

## Phase 7 — Main Daily Experience

Implement:

```text
Hari Ini
Rencana
Mata Kuliah
```

Then:

- session execution
- completion
- partial completion
- missed sessions
- understanding feedback

---

## Phase 8 — Adaptation

Implement:

- feedback signals
- weekly evaluation
- recalculated priority
- future rescheduling
- schedule-change explanation

---

## Phase 9 — Progres

Implement useful progress metrics.

Avoid decorative analytics.

---

## Phase 10 — Google Calendar

Implement:

- authorization
- app-owned event creation
- event updates
- event deletion
- deduplication
- token handling
- failure recovery

---

## Phase 11 — Production Polish

Implement:

- PWA
- desktop refinement
- accessibility
- loading states
- error states
- empty states
- responsive polish
- security review
- E2E tests
- Vercel deployment

---

# 88. Definition of Done

A completely new student must be able to understand and complete this flow without external guidance:

```text
Daftar
  ↓
Unggah KRS
  ↓
Periksa Mata Kuliah
  ↓
Atur Jadwal Mingguan
  ↓
Isi Kebiasaan Belajar
  ↓
Evaluasi Mata Kuliah
  ↓
Periksa Ringkasan
  ↓
Buat Rencana Belajar
  ↓
Rencana Belajar Siap
  ↓
Hari Ini
```

Afterward, the student must be able to:

1. know what to study today,
2. see their upcoming study schedule,
3. complete or miss a session,
4. provide lightweight feedback,
5. receive sensible future adjustments,
6. see their progress,
7. optionally sync future sessions to Google Calendar.

The core product identity is:

```text
Bukan sekadar membuat jadwal.

Aplikasi belajar dari kondisi mahasiswa
dan menyesuaikan rencana belajarnya
seiring waktu.
```

---

# 89. Final Instructions to Codex

Start from an empty project.

Before implementing major features:

1. read this entire brief,
2. create a concise technical implementation plan,
3. establish the database/domain model,
4. define the main user state machine,
5. define the six-step setup wizard,
6. implement phase by phase.

Do not try to finish all phases in one uncontrolled pass.

Prioritize:

```text
User Flow
>
Domain Correctness
>
Scheduling Quality
>
Adaptation
>
AI Enrichment
>
Visual Polish
```

The most important milestone is NOT having many features.

The most important milestone is having one extremely clear end-to-end experience:

```text
KRS
→ Mata Kuliah
→ Jadwal Mingguan
→ Kebiasaan Belajar
→ Evaluasi Mata Kuliah
→ Ringkasan
→ Buat Rencana
→ Hari Ini
```

Every user-facing sentence in the finished application must be written in Bahasa Indonesia.

Do not leave placeholder English copy in the final UI.