// Overlay event helpers — pure functions, no DOM or state dependencies.
// Handles structured ICS event data separate from the cycle-day calendar.
(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    }
    if (root) {
        root.OverlayHelpers = factory();
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {

    // Events whose summaries match this are cycle-day structural events;
    // they should not be stored as overlay events.
    const CYCLE_DAY_RE = /Day\s+[A-D]-?[1-5]/i;

    /**
     * Build a calendarOverlayEventsByDate map from a flat array of parsed ICS
     * event objects.  Each input event should have:
     *   { date: "YYYY-MM-DD", summary: string, allDay?: boolean,
     *     startTime?: string|null, endTime?: string|null }
     *
     * Returns:
     *   { "YYYY-MM-DD": [ { title, source, allDay, startTime, endTime }, … ] }
     *
     * Cycle-day events are excluded.  Duplicate titles per date are deduplicated.
     */
    function buildOverlayEventsFromICS(parsedEvents) {
        if (!Array.isArray(parsedEvents)) return {};
        const result = {};

        parsedEvents.forEach(function (ev) {
            if (!ev || !ev.summary) return;
            if (CYCLE_DAY_RE.test(ev.summary)) return; // skip cycle-day structural events

            const dateKey = ev.date;
            if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;

            if (!result[dateKey]) result[dateKey] = [];

            // Deduplicate by title within the same date
            if (result[dateKey].some(function (e) { return e.title === ev.summary; })) return;

            result[dateKey].push({
                title:     ev.summary,
                source:    'ics',
                allDay:    ev.allDay !== false,
                startTime: ev.startTime  || null,
                endTime:   ev.endTime    || null,
            });
        });

        return result;
    }

    /**
     * Merge two overlay maps.  Returns a new object; neither input is mutated.
     * Events in `incoming` that already exist (same title, same date) in
     * `existing` are skipped.
     */
    function mergeOverlayEvents(existing, incoming) {
        if (!existing || typeof existing !== 'object') existing = {};
        if (!incoming || typeof incoming !== 'object') incoming = {};

        var result = {};

        // Copy existing
        Object.keys(existing).forEach(function (dateKey) {
            result[dateKey] = existing[dateKey].slice();
        });

        // Merge incoming
        Object.keys(incoming).forEach(function (dateKey) {
            if (!result[dateKey]) {
                result[dateKey] = incoming[dateKey].slice();
            } else {
                var existingTitles = new Set(result[dateKey].map(function (e) { return e.title; }));
                incoming[dateKey].forEach(function (ev) {
                    if (!existingTitles.has(ev.title)) {
                        result[dateKey].push(ev);
                        existingTitles.add(ev.title);
                    }
                });
            }
        });

        return result;
    }

    /**
     * Filter an overlay map to only include dates within the given month keys
     * (Array of "YYYY-MM" strings).  Useful when narrowing to active range.
     * Pass null/undefined activeMonthKeys to return the map unfiltered.
     */
    function filterOverlayToMonths(overlayByDate, activeMonthKeys) {
        if (!activeMonthKeys) return overlayByDate;
        const allowed = new Set(activeMonthKeys);
        const result  = {};
        Object.keys(overlayByDate).forEach(function (dateKey) {
            const monthKey = dateKey.slice(0, 7);
            if (allowed.has(monthKey)) result[dateKey] = overlayByDate[dateKey];
        });
        return result;
    }

    return {
        buildOverlayEventsFromICS: buildOverlayEventsFromICS,
        mergeOverlayEvents:        mergeOverlayEvents,
        filterOverlayToMonths:     filterOverlayToMonths,
    };
});
