// Tests for src/calendar/overlayHelpers.js
const { buildOverlayEventsFromICS, mergeOverlayEvents, filterOverlayToMonths } =
    require('../src/calendar/overlayHelpers');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (!condition) {
        failed++;
        console.error(`FAIL: ${message}`);
    } else {
        passed++;
    }
}

function assertDeepEqual(actual, expected, message) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
        failed++;
        console.error(`FAIL: ${message}\n  Expected: ${e}\n  Actual:   ${a}`);
    } else {
        passed++;
    }
}

// ── buildOverlayEventsFromICS ─────────────────────────────────────────────────

// Cycle-day events are excluded
(function testCycleDayExcluded() {
    const events = [
        { date: '2026-05-01', summary: 'Day A-1', allDay: true, startTime: null, endTime: null },
        { date: '2026-05-01', summary: 'Day B2',  allDay: true, startTime: null, endTime: null },
    ];
    const result = buildOverlayEventsFromICS(events);
    assertDeepEqual(result, {}, 'Cycle-day events should be excluded from overlay');
})();

// Non-cycle events are included
(function testNonCycleIncluded() {
    const events = [
        { date: '2026-05-15', summary: 'HS Final Exams @Godbout Hall', allDay: true,  startTime: null,    endTime: null },
        { date: '2026-05-16', summary: 'Staff Meeting',                  allDay: false, startTime: '08:30', endTime: '09:00' },
    ];
    const result = buildOverlayEventsFromICS(events);
    assert(result['2026-05-15'] && result['2026-05-15'].length === 1, 'Should have one event on 2026-05-15');
    assert(result['2026-05-15'][0].title === 'HS Final Exams @Godbout Hall', 'Title should match');
    assert(result['2026-05-15'][0].source === 'ics', 'Source should be ics');
    assert(result['2026-05-15'][0].allDay === true, 'allDay should be true');
    assert(result['2026-05-16'][0].startTime === '08:30', 'startTime should be preserved');
})();

// Duplicate titles on same date are deduplicated
(function testDeduplication() {
    const events = [
        { date: '2026-06-01', summary: 'Assembly', allDay: true, startTime: null, endTime: null },
        { date: '2026-06-01', summary: 'Assembly', allDay: true, startTime: null, endTime: null },
        { date: '2026-06-01', summary: 'Field Trip', allDay: true, startTime: null, endTime: null },
    ];
    const result = buildOverlayEventsFromICS(events);
    assert(result['2026-06-01'].length === 2, 'Duplicate titles should be deduplicated (got ' + (result['2026-06-01'] || []).length + ')');
})();

// Mixed cycle and non-cycle events on same day
(function testMixed() {
    const events = [
        { date: '2026-05-10', summary: 'Day C-3', allDay: true, startTime: null, endTime: null },
        { date: '2026-05-10', summary: 'Last Day of School', allDay: true, startTime: null, endTime: null },
    ];
    const result = buildOverlayEventsFromICS(events);
    assert(result['2026-05-10'] && result['2026-05-10'].length === 1, 'Only non-cycle event should appear');
    assert(result['2026-05-10'][0].title === 'Last Day of School', 'Non-cycle event title should match');
})();

// Empty input
(function testEmpty() {
    assertDeepEqual(buildOverlayEventsFromICS([]),  {}, 'Empty array should return {}');
    assertDeepEqual(buildOverlayEventsFromICS(null), {}, 'Null input should return {}');
})();

// ── mergeOverlayEvents ────────────────────────────────────────────────────────

// Merges two disjoint maps
(function testMergeDisjoint() {
    const a = { '2026-05-01': [{ title: 'Exam', source: 'ics', allDay: true, startTime: null, endTime: null }] };
    const b = { '2026-06-01': [{ title: 'Trip', source: 'ics', allDay: true, startTime: null, endTime: null }] };
    const result = mergeOverlayEvents(a, b);
    assert(result['2026-05-01'] && result['2026-06-01'], 'Both dates should appear after merge');
    assert(result['2026-05-01'].length === 1 && result['2026-06-01'].length === 1, 'Each date has one event');
})();

// Deduplicates across merges
(function testMergeDedup() {
    const existing = { '2026-05-01': [{ title: 'Exam', source: 'ics', allDay: true, startTime: null, endTime: null }] };
    const incoming = {
        '2026-05-01': [
            { title: 'Exam',     source: 'ics', allDay: true, startTime: null, endTime: null },
            { title: 'Assembly', source: 'ics', allDay: true, startTime: null, endTime: null },
        ]
    };
    const result = mergeOverlayEvents(existing, incoming);
    assert(result['2026-05-01'].length === 2, 'Duplicate title should not be added again (got ' + result['2026-05-01'].length + ')');
    assert(result['2026-05-01'][1].title === 'Assembly', 'New unique event should be added');
})();

// Does not mutate inputs
(function testImmutability() {
    const existing = { '2026-05-01': [{ title: 'A', source: 'ics', allDay: true, startTime: null, endTime: null }] };
    const incoming = { '2026-05-01': [{ title: 'B', source: 'ics', allDay: true, startTime: null, endTime: null }] };
    const result = mergeOverlayEvents(existing, incoming);
    assert(existing['2026-05-01'].length === 1, 'Existing input should not be mutated');
    assert(result['2026-05-01'].length === 2, 'Result should have both events');
})();

// ── filterOverlayToMonths ────────────────────────────────────────────────────

(function testFilter() {
    const overlay = {
        '2026-05-15': [{ title: 'May Event',  source: 'ics', allDay: true, startTime: null, endTime: null }],
        '2026-06-10': [{ title: 'June Event', source: 'ics', allDay: true, startTime: null, endTime: null }],
        '2026-07-04': [{ title: 'July Event', source: 'ics', allDay: true, startTime: null, endTime: null }],
    };
    const filtered = filterOverlayToMonths(overlay, ['2026-05', '2026-06']);
    assert( filtered['2026-05-15'],  'May date should be present');
    assert( filtered['2026-06-10'],  'June date should be present');
    assert(!filtered['2026-07-04'],  'July date should be excluded');
})();

(function testFilterNull() {
    const overlay = { '2026-05-15': [] };
    const result = filterOverlayToMonths(overlay, null);
    assert(result === overlay, 'Null month keys should return the original map unfiltered');
})();

// ── Summary ────────────────────────────────────────────────────────────────────

console.log(`\nOverlay helpers tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
