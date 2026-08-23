# Graph Report - /Users/bcamaster/Documents/SNZ_Playground/personal/planify  (2026-08-23)

## Corpus Check
- Corpus is ~26,093 words - fits in a single context window. You may not need a graph.

## Summary
- 199 nodes · 249 edges · 19 communities (12 shown, 7 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Onboarding UI
- Development Tooling
- TypeScript Compiler
- Runtime Dependencies
- Onboarding Domain
- Planning Requirements
- Setup State Flow
- UI Component Config
- Project Scripts
- TypeScript Inputs
- Phase 1–2 Architecture
- Root Layout
- Auth Session Proxy
- Lint Configuration
- Next.js Configuration
- Next.js Types
- CSS Processing
- Tailwind Theme

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `OnboardingApp()` - 7 edges
3. `createSupabaseBrowserClient()` - 7 edges
4. `scripts` - 6 edges
5. `isSupabaseConfigured()` - 6 edges
6. `include` - 6 edges
7. `tailwind` - 5 edges
8. `canAdvance()` - 5 edges
9. `nextStep()` - 5 edges
10. `Scheduling Engine` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Rendered Two-Column KRS Approval Form` --semantically_similar_to--> `KRS Reference Document`  [INFERRED] [semantically similar]
  tmp/pdfs/download.pdf.png → download.pdf
- `Visible Mock KRS Extraction` --semantically_similar_to--> `Planify Phase 1–2 Summary`  [INFERRED] [semantically similar]
  README.md → docs/summary/phase-1-2.md
- `Onboarding Persistence` --semantically_similar_to--> `Demo and Supabase Setup Persistence`  [INFERRED] [semantically similar]
  README.md → docs/summary/phase-1-2.md
- `KRS Course Extraction` --conceptually_related_to--> `KRS Reference Document`  [INFERRED]
  brief.md → download.pdf
- `KRS Deduplication` --references--> `Duplicated Course Tables`  [EXTRACTED]
  brief.md → download.pdf

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **KRS Processing and Verification** — brief_krs_extraction_service, brief_krs_extraction_pipeline, brief_krs_course_extraction, brief_krs_deduplication, brief_manual_krs_fallback [EXTRACTED 1.00]
- **Priority-to-Session Planning Flow** — brief_priority_engine, brief_priority_factor_model, brief_scheduling_engine, brief_study_session_model [EXTRACTED 1.00]

## Communities (19 total, 7 thin omitted)

### Community 0 - "Onboarding UI"
Cohesion: 0.10
Nodes (9): Button, ALLOWED_FILE_TYPES, CourseForm(), makeRange(), minutesBetween(), ScheduleStep(), SummaryStep(), uid() (+1 more)

### Community 1 - "Development Tooling"
Cohesion: 0.10
Nodes (21): autoprefixer, eslint, eslint-config-next, devDependencies, autoprefixer, eslint, eslint-config-next, postcss (+13 more)

### Community 2 - "TypeScript Compiler"
Cohesion: 0.10
Nodes (21): dom, dom.iterable, esnext, ./src/*, compilerOptions, allowJs, esModuleInterop, incremental (+13 more)

### Community 3 - "Runtime Dependencies"
Cohesion: 0.11
Nodes (19): gsap, @gsap/react, lucide-react, next, dependencies, gsap, @gsap/react, lucide-react (+11 more)

### Community 4 - "Onboarding Domain"
Cohesion: 0.15
Nodes (15): mockCourses, withMockCourses(), normalizeCourseName(), normalizeMockCourses(), AcademicEvent, AcademicEventType, ActivityDensity, Course (+7 more)

### Community 5 - "Planning Requirements"
Cohesion: 0.15
Nodes (17): Adaptive Study Planner Brief, Deterministic Planning Architecture, Hard Scheduling Constraints, KRS Course Extraction, KRS Deduplication, KRS Extraction Pipeline, KrsExtractionService, Manual KRS Entry Fallback (+9 more)

### Community 6 - "Setup State Flow"
Cohesion: 0.21
Nodes (13): HariIniPage(), AuthPanel(), formatDate(), OnboardingApp(), canAdvance(), jumpToStep(), nextStep(), onboardingDataSchema (+5 more)

### Community 7 - "UI Component Config"
Cohesion: 0.14
Nodes (13): aliases, components, ui, utils, rsc, $schema, style, tailwind (+5 more)

### Community 8 - "Project Scripts"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, lint, test, typecheck (+1 more)

### Community 9 - "TypeScript Inputs"
Cohesion: 0.22
Nodes (8): .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, src/**/*.ts, src/**/*.tsx, exclude, include

### Community 10 - "Phase 1–2 Architecture"
Cohesion: 0.29
Nodes (8): /hari-ini Handoff, Demo and Supabase Setup Persistence, Planify Phase 1–2 Summary, RLS and Private KRS Storage, Six-Step Onboarding, Onboarding Persistence, Visible Mock KRS Extraction, Planify Phase 1–2

## Knowledge Gaps
- **78 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+73 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Development Tooling` to `Project Scripts`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Runtime Dependencies` to `Project Scripts`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `compilerOptions` connect `TypeScript Compiler` to `TypeScript Inputs`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _78 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Onboarding UI` be split into smaller, more focused modules?**
  _Cohesion score 0.09846153846153846 - nodes in this community are weakly interconnected._
- **Should `Development Tooling` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `TypeScript Compiler` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._