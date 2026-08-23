# Planify Phase 1–2

## Boundary

The repository currently covers Phase 1 (application foundation) and Phase 2 (the six-step onboarding flow) only. The post-onboarding screen is a guarded handoff, not the Phase 3 planning product.

## Stack and architecture

Planify is a mobile-first Next.js 16 App Router application using React 19, TypeScript, Tailwind CSS, GSAP/ScrollTrigger for restrained motion, Lucide icons, Zod validation, and Supabase SSR/browser clients. Routes live in `src/app`; onboarding state, screens, mock data, and normalization live together in `src/features/onboarding`. Supabase cookie/session helpers are in `src/lib/supabase`, with auth refresh in `src/proxy.ts`. The Phase 1–2 schema and RLS policies are in `supabase/migrations/202608230001_phase_1_2.sql`.

## Routes and state transition

`/` starts at the landing/auth panel, then enters the wizard in demo mode or after Supabase sign-in. The wizard advances through KRS, course review, weekly schedule, study habits, course evaluation, and summary. “Buat Rencana Belajar” marks `planActive`, shows a short placeholder generation state, and exposes a ready state linking to `/hari-ini`. That route validates an active setup before rendering; missing or invalid local/remote setup redirects back to `/`.

## Six onboarding steps

1. **KRS** accepts PDF/JPG/JPEG/PNG files up to 10 MB, or a seven-course/21-SKS example. Extraction is deliberately a visible mock. The manual fallback creates an editable blank course when no file is available.
2. **Mata Kuliah** lets the user review, edit, add, and remove courses and credits.
3. **Jadwal Mingguan** records fixed class schedules and available study ranges, with evening/weekend presets or manual ranges.
4. **Kebiasaan Belajar** records focus periods, session duration, activity density, and procrastination frequency.
5. **Evaluasi Mata Kuliah** records understanding and difficulty per course; academic events such as tasks, quizzes, exams, or projects are optional.
6. **Ringkasan** shows the captured semester, workload, focus context, availability, attention candidates, and nearest event, with edit links before activation.

## Persistence and auth

Demo and browser state use the `planify:onboarding:v1` localStorage key, validated through the shared Zod schema so reloads resume the last step and active plan. When Supabase is configured, email sign-up/sign-in, sign-out, password reset, and password recovery are available. Authenticated setup is resumed from the latest active `semesters.setup_payload`; subsequent changes upsert the user profile timezone and semester payload. The current UI stores the onboarding payload remotely, while actual KRS binary upload is not wired yet.

## Database, RLS, and KRS storage

The migration creates foundation/onboarding tables for profiles, semesters, KRS documents, courses, enrollments, class schedules, learning profiles, availability, per-course evaluations, and academic events. Row-level security is enabled with policies scoped to `auth.uid()` (including relationship checks for enrollments and class schedules). It also creates a private `krs` Storage bucket and limits object access to paths whose first folder is the authenticated user ID.

## Design, accessibility, and localization

The visual direction is calm, editorial, and human: cream surfaces, moss structure, coral emphasis, generous spacing, and mobile-first responsive layouts. Copy and labels are Indonesian (`lang="id"`, `id-ID` date formatting); timezone is detected from the browser. Focus-visible outlines, labeled native file/date/time/select controls, status/alert roles, semantic headings, adequate touch targets, and a reduced-motion media-query/GSAP branch provide the current accessibility baseline.

## Verification

Run the repository checks from the project root:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm audit --omit=dev --audit-level=high
```

The commit containing this summary records the results of these commands.

## Known limitations and out of scope

KRS parsing/OCR and real Storage upload are not implemented; uploaded files only drive the mock extraction state and metadata. There is no prioritization engine, scheduling engine, Groq integration, calendar integration, offline mode, main navigation, or study-session experience yet. `/hari-ini` remains a minimal Phase 2 handoff, and Phase 3+ work should build on the validated onboarding payload rather than be inferred from this screen.
