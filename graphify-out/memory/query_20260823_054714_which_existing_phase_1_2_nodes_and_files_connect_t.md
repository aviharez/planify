---
type: "query"
date: "2026-08-23T05:47:14.421333+00:00"
question: "Which existing Phase 1–2 nodes and files connect to Phase 3 KRS processing and Phase 4 priority engine implementation?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["KrsStep()", "OnboardingApp.tsx", "types.ts", "state.ts", "normalize.ts", "SummaryStep()", "KrsExtractionService", "OcrProvider", "Priority Engine", "KRS Reference Document"]
---

# Q: Which existing Phase 1–2 nodes and files connect to Phase 3 KRS processing and Phase 4 priority engine implementation?

## Answer

Expanded from original query via vocab: [krs, extraction, ocr, priority, planning, onboarding, course, normalize, setup, state, persistence, supabase]. The graph identifies KrsStep and OnboardingApp.tsx as the Phase 3 UI/persistence seam; types.ts, state.ts/onboardingDataSchema, normalize.ts, and state.test.ts as the compatible domain/test seam; browser.ts and the documented RLS/private KRS storage as the authenticated upload seam; and SummaryStep as the Phase 4 priority-ranking seam. The brief nodes KrsExtractionService, OcrProvider, KRS Deduplication, Priority Engine, and Priority Factor Model define the new domain behavior, while download.pdf supplies the duplicated-table seven-course/21-SKS acceptance fixture.

## Outcome

- Signal: useful

## Source Nodes

- KrsStep()
- OnboardingApp.tsx
- types.ts
- state.ts
- normalize.ts
- SummaryStep()
- KrsExtractionService
- OcrProvider
- Priority Engine
- KRS Reference Document