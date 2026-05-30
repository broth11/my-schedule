# My Schedule

A lightweight static teacher schedule planner for RIS cycle-day schedules. Supports monthly calendar view, manual block selection, teacher schedule PDF import, ICS import, localStorage persistence, and PDF export.

## Run Locally

Install dev dependencies (pdfjs-dist, used by tests only):

```sh
npm install
```

Serve the project folder with any static file server:

```sh
npx serve .
```

Then open `http://localhost:3000` in a browser. The built-in school-year calendar is loaded via `fetch()`, so opening `index.html` directly as a `file://` URL will be blocked by browser security restrictions.

## Tests

Run all tests:

```sh
npm test
```

Individual test scripts:

| Command | What it checks |
|---|---|
| `npm run test:schedule-parser` | Parser against the fixture text file |
| `npm run test:schedule-parser:pdf` | Parser against `samples/schedule-ben.pdf` (requires PDF — see below) |
| `npm run test:schedule-parser:metadata` | Block titles and rooms (requires PDF test to have run first) |
| `npm run test:schedule-parser:cross-reference` | Grid vs admin-table PDF agreement (requires both PDFs — see below) |
| `npm run test:calendar-converter` | ICS → school-year JSON converter |
| `npm run test:storage` | localStorage module round-trip and migration |

### PDF fixture requirement

Two tests (`test:schedule-parser:pdf` and `test:schedule-parser:cross-reference`) read real teacher schedule PDFs. These files are excluded from git (`*.pdf` in `.gitignore`) and must be obtained from the school admin portal:

- `samples/schedule-ben.pdf` — grid-format teacher schedule
- `Teacher Schedule - Roth, Benjamin 2500.pdf` (repo root) — admin-table format

Both tests exit with a clear error message if the file is missing.

## Validate or convert calendar data

Validate the built-in school-year JSON:

```sh
npm run validate:school-year
```

Convert an official RIS ICS export into school-year JSON:

```sh
npm run convert:ics -- input.ics data/school-years/2026-2027.json
```

## Project Structure

```
index.html                        static app shell
styles/main.css                   app styles
src/main.js                       app logic (calendar rendering, state, PDF export)
src/schedule/teacherScheduleParser.js  teacher schedule PDF text parser
src/storage/localStorageStore.js  localStorage persistence helpers
data/school-years/2025-2026.json  built-in RIS cycle calendar
samples/                          fixture files for parser tests
scripts/                          Node test and utility scripts
docs/                             architecture and planning notes
.github/workflows/deploy.yml      GitHub Pages deployment
```

## Scope

The app is a focused schedule viewer. It will not become a task manager, reminder system, backend application, or Google Calendar editor.
