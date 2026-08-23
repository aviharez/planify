# Planify Phase 5 — Scheduling Engine

## Boundary

Phase 5 turns the verified Phase 4 priority snapshot into a deterministic 28-day study plan. It does not call Groq and does not add the Phase 7 daily screens, Phase 9 progress, Phase 10 Calendar, or Phase 11 polish.

## Architecture and data flow

`OnboardingApp` now builds the existing centralized `buildPlanningSnapshot`, passes it with verified courses, availability, class schedules, focus preferences, activity density, procrastination, and academic events to `generateStudyPlan`, then stores the complete plan in local state. The plan includes explainable priority factors, safe weekly capacity, policy values, date/time/duration/course allocation, and deterministic session keys. Authenticated mode inserts the plan and its sessions through the existing Supabase browser client; local/demo mode uses the validated `planify:onboarding:v1` payload.

The scheduler uses merged recurring availability, excludes fixed class conflicts and preserved session conflicts, enforces a configurable maximum session duration, minimum breaks, daily maximum, and four-week bounds, and allocates no more than `availability × density × procrastination × capacity policy`. Soft scoring favors focus periods, high-priority courses, deadline proximity, and spacing. The output is stable for the same input.

## Schema and RLS

Migration `20260823072117_phase_5_scheduling.sql` creates `study_plans` and `study_sessions`. Plans store the priority snapshot, capacity policy, weekly capacity, 28-day period, and generation timestamps. Sessions store course identity, deterministic session key, date/time/duration, status, priority factors, and future enrichment fields. Foreign keys, duration/date/time checks, parent/date/status/course indexes, explicit `authenticated` grants, revoked `anon` grants, and per-operation ownership policies using cached `(select auth.uid())` are included. Session policies also verify the owning plan and semester.

## Real KRS fixture

`download.pdf` remains the integration input. The test runs the digital PDF extraction path with an OCR provider that throws if called, asserts one page, seven unique courses, and 21 SKS, then feeds those extracted courses into the priority snapshot and scheduler.

## Tests and checks

- `npm test`: 18 passed, 0 failed (including capacity/density, class and session conflicts, daily limits, distribution/spacing, stable output, four-week bounds, and real `download.pdf` integration).
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with Next.js 16.3.2.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
- `git diff --check`: passed.

Remote Supabase dry-run listed `20260823072117_phase_5_scheduling.sql`; the migration was applied successfully. `supabase migration list` reports local and remote `202608230001`, `202608230002`, and `20260823072117`. Read-only catalog checks confirm both tables, RLS, ownership policies, and required indexes.

## Known limitations

The scheduler currently derives recurring capacity from onboarding availability and does not yet mutate session status or reschedule missed work; those behaviors belong to Phases 7–8. Remote persistence stores course identity as a stable key/name snapshot because Phase 1–4 onboarding did not yet persist course rows for every local/demo course.
