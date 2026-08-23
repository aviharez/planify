# Planify Phase 7 — Main Daily Experience

## Boundary and routes

The active-plan handoff now leads to a real daily experience. `/hari-ini` answers what to study today, `/rencana` shows a mobile week/list, `/mata-kuliah` shows priority and course context, and `/sesi/[sessionKey]` provides focused execution. The three implemented routes share a mobile-first bottom navigation that appears only after a validated active plan is loaded. Progres, Profil, Calendar, timer, and month-grid complexity remain out of scope.

## Persistence and mutations

`src/features/main/data.ts` validates local onboarding/plan state and authenticated Supabase payloads. Authenticated mode prefers the persisted `study_plans`/`study_sessions` rows and maps them into the same view model as demo localStorage state. Local status changes are saved back to the existing validated onboarding payload. Authenticated status/feedback changes call the `updateStudySession` Server Action, which re-authenticates, validates with Zod, verifies ownership, enforces status transitions, updates only the owned session, and inserts optional feedback. No raw database record is returned to the client.

Migration `20260823073408_phase_7_daily_experience.sql` adds `session_feedback` with bounded reasons and 1–5 understanding, foreign keys, ownership indexes, explicit authenticated grants, revoked anonymous grants, and separate RLS select/insert policies tied to the owning session/user.

## UX and design-plan application

The visual treatment keeps the calm cream/moss/coral editorial split: the next session is the high-contrast attention area, later sessions and weekly course accordions provide interest, and a restrained reveal motion layer supports hierarchy. The small `details` course accordions reuse the existing horizontal accordion style. GSAP reveal motion disables itself under reduced motion. Buttons have clear contrast and touch-sized targets; all visible copy, status labels, reasons, dates, and aria text are Indonesian with timezone-aware `id-ID` formatting. Completed/missed history is not silently rewritten. Understanding feedback uses the deterministic every-third-completed-session rule and is never shown after every session.

## Tests and checks

- `npm test`: 23 passed, 0 failed, including session transition, reason validation, and occasional understanding feedback tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with routes `/hari-ini`, `/rencana`, `/mata-kuliah`, and dynamic `/sesi/[sessionKey]`.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
- `git diff --check`: passed.

Remote migration dry-run listed `20260823073408_phase_7_daily_experience.sql`; push succeeded. Read-only catalog checks confirm `session_feedback`, RLS enabled, the two ownership policies, and both requested indexes. The migration list remains aligned locally/remotely through Phase 7.

## Known limitations

Course detail is read-only in this phase; editing remains in the existing onboarding data flow until a focused post-onboarding preferences surface is needed. Remote rows do not yet carry local feedback fields back into the setup payload, but the canonical feedback table is persisted and the next reload reads current session status from Supabase.
