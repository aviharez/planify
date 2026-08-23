# Planify Phase 6 — Groq Enrichment

## Boundary

Phase 6 adds optional server-only enrichment after deterministic scheduling. Groq can supply only the study method, goal, and human explanation. It cannot choose or alter dates, times, durations, session count, availability, workload, or database identifiers. A valid deterministic plan remains valid when Groq is unavailable.

## Provider and request flow

`AiProvider` lives in `src/features/ai/provider.ts`, with Zod schemas for the anonymized batch input and returned enrichment. The deterministic Indonesian fallback is generated locally before any network request. Authenticated generation stores the valid plan first, then calls the server-only `POST /api/ai/enrich` route with the remote plan ID and one batch containing every generated session's temporary `sessionKey`, course name, date, duration, priority score, knowledge gap, difficulty, and urgency. Demo/local mode never calls Groq and keeps the fallback.

The route re-checks the Supabase user and verifies ownership of the stored plan before spending provider quota. `GroqAiProvider` uses the official `groq-sdk` 1.5.0, model `openai/gpt-oss-120b`, configured reasoning effort, low temperature, and `response_format.type = json_schema` with `strict: true`, `additionalProperties: false`, and all fields required. The response is parsed and validated again with Zod, checked for exact one-to-one session-key mapping, and rejected when common English wording appears. Rejected or failed responses use deterministic Indonesian fallback enrichment; the route never returns the API key or sensitive context.

Successful enrichment updates the matching owned remote session rows by key. Local state is updated only with validated response fields, so scheduling metadata remains untouched.

## Verification

- `npm test`: 21 passed, 0 failed, including mocked provider batching, strict schema request, language rejection, and fallback mapping.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; `/api/ai/enrich` is dynamic and server-rendered.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
- `git diff --check`: passed.
- Real smoke with the configured key: `groq-smoke-ok` for one anonymized session; no key or model response content was printed.

## Known limitations

Language validation intentionally uses a small common-English word guard, not a full language detector. Provider output is optional and not used for adaptation decisions. A serverless in-memory rate limiter is not added; authenticated ownership plus bounded batch size protect the endpoint, while broader quota governance belongs to deployment infrastructure.
