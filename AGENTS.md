# Agent Guardrails

This project is a static schedule viewer. Preserve working behavior during refactors.

## Refactor Rules

- Avoid broad rewrites unless explicitly requested.
- Keep changes small, mechanical, and easy to verify.
- Keep the app deployable as a static app with no backend requirement.
- Separate parsing, rendering, storage, and export logic over time.
- Keep the RIS cycle calendar authoritative for A/B/C/D days.
- Do not move the built-in cycle calendar data out of JavaScript until requested.

## Product Guardrails

- Do not add manual reminders or task features during MVP 1 or MVP 2.
- Do not add recurring task logic.
- Do not add notifications.
- Do not add backend code unless explicitly requested.
- Do not add Google Calendar write-back.
- Do not add Google Calendar event editing.
- Do not expand this into an admin dashboard or cross-device account system.

## Validation Expectations

After refactors, verify the existing schedule views, uploads, settings, localStorage, and export controls still work.

