# My Schedule

My Schedule is a lightweight static teacher schedule planner for viewing RIS cycle-day schedules.

The current app supports monthly and daily schedule views, manual block selection, teacher schedule PDF import, ICS import, light/dark mode, custom colors, localStorage persistence, and PDF export.

## Run Locally

Serve the folder with any static file server, then open `index.html`. The built-in school-year calendar is loaded with `fetch()`, so directly opening the file may be blocked by browser file-access restrictions.

## Tests

Parser expectations and PDF extraction helpers live in `scripts/test-utils/`. Add future expected blocks, assignment titles, rooms, or shared parser assertions there instead of duplicating them in individual test scripts.

Run the baseline teacher schedule parser test:

```sh
npm run test:schedule-parser
```

Run the parser against text extracted from the sample PDF:

```sh
npm run test:schedule-parser:pdf
```

Run all parser tests:

```sh
npm test
```

Validate the built-in school-year JSON:

```sh
npm run validate:school-year
```

Convert an official ICS export into school-year JSON:

```sh
npm run convert:ics -- input.ics data/school-years/2026-2027.json
```

Run the parser metadata checks for fixture and extracted PDF text:

```sh
npm run test:schedule-parser:metadata
```

Cross-check the grid PDF against the cleaner admin-table PDF:

```sh
npm run test:schedule-parser:cross-reference
```

Run the local browser storage module test:

```sh
npm run test:storage
```

## Project Structure

- `index.html` - static app shell and existing UI markup.
- `styles/main.css` - extracted app styles.
- `src/main.js` - extracted app logic.
- `src/storage/localStorageStore.js` - local browser persistence helpers.
- `data/school-years/2025-2026.json` - built-in RIS cycle calendar data.
- `docs/calendar-data.md` - calendar JSON, ICS converter, and validation workflow.
- `docs/` - planning and architecture notes.
- `data/school-years/` - future home for school-year metadata.
- `samples/` - sample files for future parser tests.

## Scope

The app should remain a focused schedule viewer. It should not become a task manager, reminder system, backend application, or Google Calendar editor.
