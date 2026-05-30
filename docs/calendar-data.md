# Calendar Data

My Schedule uses static school-year JSON as the official shared default calendar.

## Built-In Calendar

The active built-in RIS cycle calendar lives at:

```text
data/school-years/2025-2026.json
```

School-year files are month-keyed JSON objects. Each day entry includes `date`, `day`, `cycle`, and an optional `note`.

## User ICS Fallback

Teachers can still upload ICS files in the browser. Imported ICS data is local to that browser and can override the built-in JSON when enabled.

## Admin Converter

Use the converter to create a future school-year JSON file from an official ICS export:

```sh
npm run convert:ics -- samples/ris-cycle-days-2026-2027.ics data/school-years/2026-2027.json
```

Then validate it:

```sh
node scripts/validate-school-year-json.js data/school-years/2026-2027.json
```

The converter recognizes practical cycle-day labels such as `Day A-1`, `A1`, and `Cycle Day B-2`, plus special labels such as `HOLIDAY`, `IN-SERVICE`, `PTC`, `SONGKRAN`, `HALF DAY`, `BREAK`, and `NO SCHOOL`.

## Validation

Validate the current built-in school year:

```sh
npm run validate:school-year
```

Run the converter smoke test:

```sh
npm run test:calendar-converter
```

## Not Live Calendar Sync

This converter does not add OAuth, live Google Calendar sync, backend storage, or calendar editing. Future live Google Calendar work belongs outside MVP 1.
