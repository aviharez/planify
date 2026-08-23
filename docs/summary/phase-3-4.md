# Planify Phase 3–4

## Boundary

Phase 3 replaces mock KRS extraction with real document processing and verification. Phase 4 adds deterministic course prioritization and persisted planning snapshots. Phase 5 scheduling is deliberately out of scope: `/hari-ini` is still a preparation/status screen and does not create study sessions or expose main navigation.

## Architecture

The existing mobile-first Next.js 16 App Router app remains the shell. `src/features/krs` owns PDF text extraction, page rendering, OCR, parsing, deduplication, confidence, and conflict metadata. `src/features/planning/priority.ts` owns normalized factor calculation, ranking, and snapshot construction. `OnboardingApp` coordinates progress, verification, Supabase persistence, and the six-step flow; Supabase browser/SSR clients remain in `src/lib/supabase`, with cookie refresh in `src/proxy.ts`.

## KRS processing

Digital PDFs first use `pdfjs-dist` embedded text extraction. The checked-in `download.pdf` fixture is a one-page digital PDF; its integration test injects an OCR provider that must not be called, then asserts seven unique courses, 21 SKS, and the expected course-code/name sequence.

Scanned PDFs render each page to a browser canvas before OCR. Images go directly to `TesseractOcrProvider`, which creates a Tesseract.js browser worker with the Indonesian (`ind`) model. Tesseract downloads and initializes the language/runtime assets on first OCR use, then uses its normal browser cache on later use. Progress is surfaced through reading, rendering, recognition, and parsing stages; no raw image is sent to an LLM.

The parser normalizes course codes/names, extracts period, semester, credits, status, totals, and candidates, then removes identical duplicates. Conflicting semester, credit, or status values are preserved and marked for review rather than merged. OCR confidence is combined with parser confidence; OCR below `0.8`, parser uncertainty, or conflicts sets `needsVerification`. The UI highlights affected rows, blocks advancement while processing/failed, and always offers editable manual entry when extraction fails.

## Storage and demo behavior

Demo/local mode processes the file in the browser and persists only onboarding metadata/state in local storage; it does not upload the document. For an authenticated user, the original file is uploaded to the private `krs` bucket at `<user-id>/<random-id>-<sanitized-name>`, then its metadata and extraction fields are inserted into `public.krs_documents`. If metadata insertion fails, the upload is removed when possible and a non-blocking warning is shown.

## Priority engine

`buildPlanningSnapshot` consumes verified courses, per-course understanding/difficulty, academic events, availability, and the timezone-derived current date. The centralized default policy weights academic load `20%`, knowledge gap `30%`, difficulty `20%`, urgency `25%`, and adaptation `5%`; SKS is capped at 5 and urgency uses a 30-day horizon. Each course receives normalized factor breakdowns, a weighted final score, and a stable rank. The snapshot stores those factors, weights, availability, reason (`initial` or `adaptation`), generation time, and a 28-day planning period.

The snapshot is written to local state for demo mode. Authenticated mode also inserts it into `public.planning_snapshots`. No scheduler, session allocator, Groq enrichment, or calendar integration is invoked in this phase.

## Schema and environment changes

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` was replaced by `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the browser client, server client, proxy, `.env.example`, and README. The service-role key remains server-only and is never read by client code.
- Migration `202608230002_phase_3_4.sql` expands KRS extraction status/metadata, adds `public.planning_snapshots`, adds the existing user/semester/time index plus standalone `planning_snapshots_semester_id_idx`, enables RLS, and scopes the authenticated snapshot policy to cached `auth.uid()` ownership plus the owning semester in both `USING` and `WITH CHECK`.
- Migration `202608230001_phase_1_2.sql` received one root-cause syntax correction only: `FOREACH ... IN ARRAY ARRAY[...]`. Its table/policy semantics are unchanged.

## Remote Supabase verification

Using the authenticated Supabase CLI and a project ref derived from `NEXT_PUBLIC_SUPABASE_URL` without printing credentials:

```bash
project_ref=$(sed -n 's#^NEXT_PUBLIC_SUPABASE_URL=https://\([^./]*\)\.supabase\.co.*#\1#p' .env)
npm exec --yes --package=supabase@latest -- supabase db push --dry-run --project-ref "$project_ref" --yes
npm exec --yes --package=supabase@latest -- supabase db push --project-ref "$project_ref" --yes
npm exec --yes --package=supabase@latest -- supabase migration list --project-ref "$project_ref"
npm exec --yes --package=supabase@latest -- supabase db query --linked --project-ref "$project_ref" --output-format json "select table_name from information_schema.tables where table_schema='public' and table_name in ('planning_snapshots','krs_documents')"
npm exec --yes --package=supabase@latest -- supabase db query --linked --project-ref "$project_ref" --output-format json "select policyname, roles::text, qual ~* 'auth\\.uid' as using_auth_uid, with_check ~* 'auth\\.uid' as check_auth_uid, qual ~* 'semesters' as using_semester_check, with_check ~* 'semesters' as check_semester_check from pg_policies where schemaname='public' and tablename='planning_snapshots'"
```

The dry-run listed exactly migrations `202608230001` and `202608230002`; the real push applied both. `migration list` reports both local and remote versions. The read-only catalog checks confirm `planning_snapshots`, `krs_documents.ocr_confidence`, both requested indexes, RLS on `planning_snapshots` and `krs_documents`, and the authenticated ownership policy with cached `auth.uid()`, ownership, and semester checks in both branches. No user rows were queried.

## Verification

Run from the repository root:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm audit --omit=dev --audit-level=high
git diff --check
```

Current results: 14 tests passed; typecheck, lint, build, and diff check passed; audit reported 0 vulnerabilities at high-or-worse severity.

## Known limitations and out of scope

There is no Phase 5 scheduling engine, four-week session allocation, conflict resolver, session execution, adaptive rescheduling, Groq provider, Google Calendar integration, main navigation, offline sync, or production OCR review workflow. OCR model download is client-side and can make first use slower. Storage and snapshots depend on a configured/authenticated Supabase account; demo mode remains local. Manual review is intentionally required for uncertain or conflicting extraction results.
