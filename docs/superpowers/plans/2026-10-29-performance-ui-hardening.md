# Performance and professional UI implementation plan

**Goal:** Extend the approved audit with photo compression, temporary resource cleanup, robust routes and consistent Union light/dark presentation.
**Architecture:** Reuse the central image optimizer and shared admin components; preserve module permissions, document originals, animation policy and existing workflows. No database changes or deletion of production files.
**Tech stack:** React, TypeScript, Vite, Tailwind, Supabase.

- [x] Inspect current main, preserve new quote-photo and optional company identity work.
- [x] Trace raw photo flows and integrate existing compressor, final endpoint limits, transparency, mobile decoder fallback and allocation cleanup. Test boundary behavior and duplicate preparation.
- [x] Lazy-load PDF renderer and clean only artifacts owned by the export. Test concurrency/failure and malformed route decoding.
- [x] Refine shared neutral surfaces, fields, tables, navigation and portal theme tokens; retain Union blue and reduced movement.
- [ ] Run regression, finance, SAC and document checks; build both production outputs.
- [ ] Review combined changes, publish with a safe fast-forward and inspect deployed light/dark UI and public pages.
- [ ] Document measured improvements and remaining limitations without claiming exhaustive device or permission coverage.
