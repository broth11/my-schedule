# PDF Import Plan

PDF import currently reads PDFs in `src/main.js` and uses parser helpers from `src/schedule/teacherScheduleParser.js`.

## Goal

Reliably parse teacher schedule PDFs into block assignments while preserving the RIS cycle-day calendar as the source of truth for A/B/C/D days.

## Important Sample Cases

Use `samples/schedule-ben.pdf` and `samples/schedule-ben.fixture.txt` for parser tests. The fixture is a baseline before parser refactoring and includes these expressions:

- `HR(A-D)`
- `2(A-C)`
- `3(A,C-D)`
- `4(A,C-D)`
- `FX(A)`
- `ELB(A-D)`
- `5(B-D)`
- `1(B,D)`
- `2(D)`

## Supported PDF Formats

The parser currently distinguishes two teacher schedule PDF formats:

- `grid`: the original grid-style PDF at `samples/schedule-ben.pdf`, with A/B/C/D rows and HR/1/2/3/4/FX/ELB/5 columns.
- `admin-table`: the cleaner admin-table PDF at `Teacher Schedule - Roth, Benjamin 2500.pdf`, with row-per-section columns such as Expression, Term, Course #, Course, Sec #, Room, and Enrollment.

The admin-table PDF is treated as the higher-confidence reference because its extracted text keeps each schedule section closer to one logical row. The grid PDF is still the user-facing legacy sample and remains covered by fixture, real-PDF, metadata, and cross-reference tests.

Expected teaching block expansion:

- `HR(A-D)` -> `A-HR`, `B-HR`, `C-HR`, `D-HR`
- `2(A-C)` -> `A2`, `B2`, `C2`
- `3(A,C-D)` -> `A3`, `C3`, `D3`
- `4(A,C-D)` -> `A4`, `C4`, `D4`
- `FX(A)` -> `A-FX`
- `ELB(A-D)` -> `A-ELB`, `B-ELB`, `C-ELB`, `D-ELB`
- `5(B-D)` -> `B5`, `C5`, `D5`
- `1(B,D)` -> `B1`, `D1`
- `2(D) Common Planning Time` -> planning/non-teaching, not `D2` teaching

## Known Import Details

PDF text extraction may produce unusual dash characters in ranges, including `￾` in text like `A￾D`. The parser currently normalizes those dash variants before matching expressions.

Common Planning Time must be treated as planning/non-teaching. It may be counted as an ignored planning block, but it must not be silently included as a teaching block.

Expected metadata from the sample schedule:

- Homeroom blocks -> `Homeroom 10`, room `H406`, category `homeroom`
- `A2`, `B2`, `C2` -> `IB Math AI HL Y1`, room `H406`, category `teaching`
- `A3`, `C3`, `D3` -> `Accelerated Math 9`, room `H406`, category `teaching`
- `A4`, `C4`, `D4` -> `IB Math AI HL Y2`, room `H406`, category `teaching`
- `A-FX` -> `Advisory 10`, room `H406`, category `advisory`
- ELB blocks -> `Extended Learning Block`, room `H406`, category `elb`
- `B5`, `C5`, `D5` -> `Accelerated Math 9`, room `H406`, category `teaching`
- `B1`, `D1` -> `Data Science`, room `H406`, category `teaching`
- `D2` -> `Common Planning Time`, category `planning`, ignored from teaching

Course-title extraction is still sample-pattern based and therefore brittle. The metadata tests exist to lock down the known PDF shapes before building an import preview table.

## Test Commands

Shared parser expectations and assertion helpers live in `scripts/test-utils/`. Update those helpers when adding new expected blocks, metadata, or sample schedules.

- `npm run test:schedule-parser` checks the curated text fixture.
- `npm run test:schedule-parser:pdf` extracts text from `samples/schedule-ben.pdf`, writes `tmp/schedule-ben.extracted.txt`, and checks the parsed block set.
- `npm run test:schedule-parser:metadata` checks course titles, rooms, categories, and final block deduplication for the fixture and extracted PDF text.
- `npm run test:schedule-parser:cross-reference` extracts both PDFs, writes `tmp/schedule-ben.grid.extracted.txt` and `tmp/schedule-ben.admin.extracted.txt`, and verifies that both formats produce the same final teaching block set and metadata.
- `npm test` runs all parser checks.

## Why Keep Both Tests

The fixture test is the stable parser baseline. It keeps the important expressions small and readable, including the unusual dash character case.

The PDF extraction test verifies the same expected teaching block set against the actual file teachers upload. The extracted PDF text currently repeats schedule expressions across multiple displayed sections, so its expression count is higher than the fixture. The test therefore checks the final teaching block set, confirms there are no unexpected teaching blocks such as `D2`, and reports the expression and planning counts as diagnostics.

The real PDF extraction places some course names before their schedule expression, including `Common Planning Time ... 2(D)`. The parser accounts for that when detecting non-teaching/planning blocks.

The cross-reference test protects the expected final block set across both PDF formats:

`A-HR`, `B-HR`, `C-HR`, `D-HR`, `A2`, `B2`, `C2`, `A3`, `C3`, `D3`, `A4`, `C4`, `D4`, `A-FX`, `A-ELB`, `B-ELB`, `C-ELB`, `D-ELB`, `B5`, `C5`, `D5`, `B1`, `D1`.

Metadata comparison currently passes for the known sample titles and room `H406`, but it remains limited to the course title patterns represented in these PDFs.

## Future Work

- Extract PDF parsing into a dedicated module.
- Add fixtures and parser tests before changing parsing behavior.
- Document supported block expression syntax.
- Keep upload UI behavior unchanged while parser internals are improved.
