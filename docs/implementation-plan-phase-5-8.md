# Implementation Plan: Phases 5–8

## Constraints and success criteria

- Preserve the verified onboarding payload and `buildPlanningSnapshot` as the only priority source; scheduling is deterministic, server-safe, and independent of Groq.
- Keep all public UI wording in natural Bahasa Indonesia with `id-ID` dates and the detected/persisted timezone. Preserve local/demo parity with authenticated Supabase persistence.
- Use the real `download.pdf` integration path and assert seven unique courses/21 SKS before scheduling.
- Add only the smallest persisted plan/session, AI enrichment, feedback, and weekly evaluation data needed for Phases 5–8. Every public table gets explicit grants, RLS, ownership checks, and useful indexes.
- Keep Next.js server-only secrets behind server actions/route handlers, validate every mutation with Zod, and never send scheduling authority or credentials to Groq.
- Run the requested tests/checks after each phase, write an exact summary, inspect the diff, and commit only that phase before continuing.

## Phase boundaries and acceptance

1. **Scheduling:** capacity policy, conflict-aware 28-day allocation, local/Supabase persistence, real-KRS integration, and deterministic tests. The generation handoff must expose an actual plan/session set.
2. **Groq:** one batched, server-only provider using strict structured output, Zod validation, Indonesian fallback enrichment, and mocked plus safe smoke verification.
3. **Daily experience:** `/hari-ini`, `/rencana`, `/mata-kuliah`, focused session execution, validated status/feedback mutations, mobile navigation, and accessible restrained motion. No Progres/Profile/Calendar pages.
4. **Adaptation:** bounded deterministic priority signals, future-only minimal-churn rescheduling, weekly evaluation, secure persistence, and an Indonesian change explanation. Completed history never changes.

<design_plan>
Python RNG:
seed=383
hero=Editorial Split; font=Geist
components=Horizontal Accordions, Inline Typography Images, Feedback/Testimonial Carousel; gsap=Scroll Pinning, Scrubbing Text Reveals
AIDA: premium app navigation; Attention is the next-session editorial area; Interest is today/weekly course content; Desire is restrained pinned/reveal planning context; Action is the high-contrast session CTA and bottom navigation. Do not turn this internal productivity app into a marketing/pricing page.
Hero uses max-w-6xl and stays 2–3 lines with no stamp icons, spam tags, or raw hero stats.
Any bento layout must use grid-flow-dense and mathematically fill all columns/rows; use only if it genuinely serves the product.
No numbered/cheap meta-labels; button contrast is accessible.
</design_plan>

## Deliberate omissions

Do not implement Phase 9 Progres, Phase 10 Calendar, Phase 11 polish, or unrelated infrastructure. Skip timers, month-grid complexity, irrelevant testimonials/stock imagery, and speculative abstractions unless an existing product seam requires them.
