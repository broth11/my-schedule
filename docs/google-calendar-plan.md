# Google Calendar Plan

Google Calendar support should stay read-only unless explicitly re-scoped.

## Current Position

The app supports ICS import. It does not use Google OAuth and does not write to Google Calendar.

## Allowed Direction

- Continue supporting imported `.ics` files.
- Consider documented instructions for exporting calendars to ICS.
- Keep imported events local to the browser.

## Non-Goals

- No Google Calendar OAuth during MVP 1 or MVP 2.
- No Google Calendar write-back.
- No editing Google Calendar events.
- No backend sync service.

