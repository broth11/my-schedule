# Architecture

My Schedule is currently a static browser app.

## Current Shape

- `index.html` contains the app shell and existing inline event attributes.
- `styles/main.css` contains the extracted CSS.
- `src/main.js` contains the extracted JavaScript.
- `src/storage/localStorageStore.js` centralizes browser localStorage persistence and legacy-state migration.
- `data/school-years/2025-2026.json` contains the built-in RIS cycle calendar used at startup.
- Browser localStorage stores user selections, imported calendar data, imported schedule data, colors, theme, and date range settings through the storage module.

## Data Loading

The app remains static. On startup, `src/main.js` fetches `data/school-years/2025-2026.json`, validates that it is a month-keyed object of day entries, and then renders the first available month. If the JSON cannot be loaded, the calendar area shows a non-crashing error with the option to upload an ICS calendar.

Admin/developer calendar tooling lives outside the browser app. `src/calendar/icsToSchoolYearJson.js` converts official ICS exports into school-year JSON, and `src/calendar/schoolYearValidator.js` validates generated or edited JSON files.

## Local Persistence

MVP 1 persistence is local-only. `src/storage/localStorageStore.js` owns localStorage reads, writes, defaults, and migration from the earlier unversioned `teacherSchedule` shape. There is no backend storage, account sync, or cross-device state.

## Intended Direction

Future refactors should separate:

- parsing: PDF and ICS import logic,
- rendering: monthly and daily views,
- storage: localStorage read/write helpers,
- export: print and PDF export logic,
- data: school-year and cycle calendar metadata.

The app should remain static and should not require a server to run.
