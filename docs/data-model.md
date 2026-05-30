# Data Model

The app keeps runtime state in `src/main.js`, browser persistence helpers in `src/storage/localStorageStore.js`, and built-in school-year cycle data in `data/school-years/2025-2026.json`.

## Core Concepts

- Cycle day: authoritative RIS A/B/C/D calendar day.
- Built-in calendar data: month-keyed school-year JSON loaded from `data/school-years/2025-2026.json`.
- Calendar source metadata: future source notes live in `data/calendar-sources.json`, not inside the school-year folder.
- Block: a class block such as `1A`, `2C`, or `ELB`.
- Block metadata: structured parsed schedule entry with block code, category, title, room, and source text.
- Selected classes: manually selected blocks stored in localStorage.
- Schedule assignments: imported or selected class assignments by block.
- Imported calendar data: parsed ICS calendar data stored separately from built-in data.
- Date range: optional start and end filters stored in localStorage.

## Parser Result

Teacher schedule parsing returns the legacy fields used by the app plus richer metadata for future preview UI:

- `selectedCodes`: deduplicated teaching/non-planning block codes.
- `assignments`: map of block code to display title for existing rendering.
- `format`: detected PDF format, currently `grid`, `admin-table`, or `unknown`.
- `blocks`: deduplicated structured metadata for final teaching/non-planning blocks.
- `ignoredBlocks`: structured metadata for ignored blocks such as Common Planning Time.
- `ignoredPlanningBlocks`: count of ignored planning block instances.
- `expressionCount`: count of matched schedule expressions.
- `rawMatches`: per-expression diagnostic metadata before final block deduplication.
- `warnings`: parser warnings reserved for future diagnostics.

Current categories are `teaching`, `homeroom`, `advisory`, `elb`, `planning`, and `other`.

## Persistence

Current localStorage keys are managed by `src/storage/localStorageStore.js`:

- `teacherSchedule`: versioned schedule settings, selected blocks, assignments, colors, theme, selected school year, and preferred view.
- `importedCalendar`: user-uploaded ICS calendar data.
- `useImportedData`: whether imported calendar data should override the built-in JSON calendar.
- `dateRangeStart` and `dateRangeEnd`: optional date range filter values.

The storage module migrates the earlier unversioned `teacherSchedule` shape, including legacy `darkMode`, into version `1`. Invalid stored JSON is ignored safely and defaults are loaded. The built-in JSON calendar is not stored in localStorage.

MVP 1 remains local-only and does not use backend storage, user accounts, or cross-device sync.

## Future Direction

Keep built-in cycle-day data authoritative. Future school years should be added as separate JSON files with the same month-keyed structure.
