# TODO

## Known Issues

- `test:schedule-parser:cross-reference` requires a second PDF (`Teacher Schedule - Roth, Benjamin 2500.pdf`) at the repo root. This file is gitignored (`*.pdf`) and must be obtained locally. The test now exits with a clear message if it is missing.
- `test:schedule-parser:metadata` depends on extracted text written by `test:schedule-parser:pdf`. Run the PDF test first when running metadata checks in isolation.

## Not Planned

- Manual reminders or task management.
- Backend database.
- Google Calendar write-back.
- Cross-device teacher accounts.
- Day detail view or per-period event editing.
