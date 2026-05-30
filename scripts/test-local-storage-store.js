const store = require('../src/storage/localStorageStore');

function createMockStorage(initialValues = {}) {
    const values = { ...initialValues };

    return {
        getItem(key) {
            return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
        },
        setItem(key, value) {
            values[key] = String(value);
        },
        removeItem(key) {
            delete values[key];
        },
        dump() {
            return { ...values };
        }
    };
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertDeepEqual(actual, expected, message) {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);

    if (actualJson !== expectedJson) {
        throw new Error(`${message}\nExpected: ${expectedJson}\nActual:   ${actualJson}`);
    }
}

function runEmptyStateTest() {
    const storage = createMockStorage();
    const settings = store.loadTeacherScheduleSettings(storage);
    const imported = store.loadImportedCalendarState(storage);
    const dateRange = store.loadDateRange(storage);

    assertDeepEqual(settings.selectedClasses, [], 'Empty storage should load no selected classes.');
    assertDeepEqual(settings.scheduleAssignments, {}, 'Empty storage should load no schedule assignments.');
    assert(settings.theme === 'light', 'Empty storage should default to light theme.');
    assert(imported.useImportedData === false, 'Empty storage should not enable imported calendar data.');
    assertDeepEqual(imported.importedCalendarData, {}, 'Empty storage should load no imported calendar data.');
    assertDeepEqual(dateRange, { startDate: '', endDate: '' }, 'Empty storage should load no date range.');
}

function runSaveLoadTeacherScheduleTest() {
    const storage = createMockStorage();

    store.saveTeacherScheduleSettings({
        selectedClasses: ['A2', 'B2'],
        scheduleAssignments: { A2: 'IB Math AI HL Y1' },
        scheduleCategories: { A2: 'teaching' },
        theme: 'dark',
        teachingColor: '#123456',
        freeColor: '#abcdef',
        selectedSchoolYear: '2025-2026',
        preferredView: 'daily'
    }, storage);

    const settings = store.loadTeacherScheduleSettings(storage);
    const raw = JSON.parse(storage.dump().teacherSchedule);

    assert(raw.version === store.STORAGE_VERSION, 'Saved teacher schedule should include storage version.');
    assertDeepEqual(settings.selectedClasses, ['A2', 'B2'], 'Saved selected classes should load.');
    assert(settings.scheduleAssignments.A2 === 'IB Math AI HL Y1', 'Saved assignment should load.');
    assert(settings.scheduleCategories.A2 === 'teaching', 'Saved category should load.');
    assert(settings.theme === 'dark', 'Saved theme should load.');
    assert(settings.teachingColor === '#123456', 'Saved teaching color should load.');
    assert(settings.freeColor === '#abcdef', 'Saved free color should load.');
    assert(settings.preferredView === 'daily', 'Saved preferred view should load.');
}

function runLegacyMigrationTest() {
    const storage = createMockStorage({
        teacherSchedule: JSON.stringify({
            selectedClasses: ['A1'],
            darkMode: true,
            teachingColor: '#111111',
            freeColor: '#eeeeee',
            scheduleAssignments: { A1: 'Legacy Class' }
        })
    });

    const migrated = store.migrateStoredStateIfNeeded(storage);
    const settings = store.loadTeacherScheduleSettings(storage);
    const raw = JSON.parse(storage.dump().teacherSchedule);

    assert(migrated === true, 'Legacy teacher schedule should be migrated.');
    assert(raw.version === store.STORAGE_VERSION, 'Migrated teacher schedule should include storage version.');
    assertDeepEqual(settings.selectedClasses, ['A1'], 'Migrated selected classes should load.');
    assert(settings.theme === 'dark', 'Legacy darkMode should migrate to dark theme.');
    assert(settings.scheduleAssignments.A1 === 'Legacy Class', 'Migrated assignments should load.');
}

function runInvalidJsonTest() {
    const storage = createMockStorage({
        teacherSchedule: '{'
    });

    const migrated = store.migrateStoredStateIfNeeded(storage);
    const settings = store.loadTeacherScheduleSettings(storage);

    assert(migrated === false, 'Invalid JSON should not be migrated.');
    assertDeepEqual(settings.selectedClasses, [], 'Invalid JSON should safely load default selected classes.');
    assert(settings.theme === 'light', 'Invalid JSON should safely load default theme.');
}

function runImportedCalendarTest() {
    const storage = createMockStorage();
    const calendarData = {
        '2026-01': [
            { date: 7, day: 'Tue', cycle: 'A1' }
        ]
    };

    store.saveImportedCalendarState({ importedCalendarData: calendarData, useImportedData: true }, storage);
    const imported = store.loadImportedCalendarState(storage);

    assert(imported.useImportedData === true, 'Imported calendar flag should load.');
    assert(imported.importedCalendarData['2026-01'][0].cycle === 'A1', 'Imported calendar data should load.');

    store.clearImportedCalendarState(storage);
    const cleared = store.loadImportedCalendarState(storage);
    assert(cleared.useImportedData === false, 'Cleared imported calendar flag should load false.');
    assertDeepEqual(cleared.importedCalendarData, {}, 'Cleared imported calendar data should load empty.');
}

function runDateRangeTest() {
    const storage = createMockStorage();

    store.saveDateRange({ startDate: '2026-01-07', endDate: '2026-05-29' }, storage);
    assertDeepEqual(store.loadDateRange(storage), {
        startDate: '2026-01-07',
        endDate: '2026-05-29'
    }, 'Saved date range should load.');

    store.clearDateRange(storage);
    assertDeepEqual(store.loadDateRange(storage), { startDate: '', endDate: '' }, 'Cleared date range should load empty.');
}

function main() {
    const tests = [
        runEmptyStateTest,
        runSaveLoadTeacherScheduleTest,
        runLegacyMigrationTest,
        runInvalidJsonTest,
        runImportedCalendarTest,
        runDateRangeTest
    ];

    tests.forEach(test => test());

    console.log('Local storage store tests passed');
    console.log(`Tests: ${tests.length}`);
    console.log('Migration: passed');
    console.log('Invalid JSON handling: passed');
}

main();
