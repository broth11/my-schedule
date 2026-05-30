(function (root, factory) {
    const store = factory();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = store;
    }

    if (root) {
        root.LocalStorageStore = store;
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    const STORAGE_VERSION = 1;
    const TEACHER_SCHEDULE_KEY = 'teacherSchedule';
    const IMPORTED_CALENDAR_KEY = 'importedCalendar';
    const USE_IMPORTED_DATA_KEY = 'useImportedData';
    const DATE_RANGE_START_KEY = 'dateRangeStart';
    const DATE_RANGE_END_KEY = 'dateRangeEnd';

    const DEFAULT_TEACHER_SCHEDULE_SETTINGS = {
        version: STORAGE_VERSION,
        selectedClasses: [],
        scheduleAssignments: {},
        scheduleCategories: {},
        theme: 'light',
        teachingColor: '#10b981',
        freeColor: '#e5e7eb',
        selectedSchoolYear: '2025-2026',
        preferredView: 'monthly'
    };

    function getDefaultStorage() {
        if (typeof localStorage === 'undefined') {
            return null;
        }

        return localStorage;
    }

    function isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function readJson(storage, key) {
        if (!storage) return null;

        const rawValue = storage.getItem(key);
        if (!rawValue) return null;

        try {
            return JSON.parse(rawValue);
        } catch (error) {
            return null;
        }
    }

    function writeJson(storage, key, value) {
        if (!storage) return;
        storage.setItem(key, JSON.stringify(value));
    }

    function normalizeTheme(value, darkMode) {
        if (value === 'dark' || value === 'light') {
            return value;
        }

        return darkMode ? 'dark' : 'light';
    }

    function normalizeTeacherScheduleSettings(value) {
        const source = isPlainObject(value) ? value : {};

        return {
            ...DEFAULT_TEACHER_SCHEDULE_SETTINGS,
            version: STORAGE_VERSION,
            selectedClasses: Array.isArray(source.selectedClasses) ? source.selectedClasses : [],
            scheduleAssignments: isPlainObject(source.scheduleAssignments) ? source.scheduleAssignments : {},
            scheduleCategories: isPlainObject(source.scheduleCategories) ? source.scheduleCategories : {},
            theme: normalizeTheme(source.theme, source.darkMode),
            teachingColor: typeof source.teachingColor === 'string' && source.teachingColor ? source.teachingColor : DEFAULT_TEACHER_SCHEDULE_SETTINGS.teachingColor,
            freeColor: typeof source.freeColor === 'string' && source.freeColor ? source.freeColor : DEFAULT_TEACHER_SCHEDULE_SETTINGS.freeColor,
            selectedSchoolYear: typeof source.selectedSchoolYear === 'string' && source.selectedSchoolYear ? source.selectedSchoolYear : DEFAULT_TEACHER_SCHEDULE_SETTINGS.selectedSchoolYear,
            preferredView: typeof source.preferredView === 'string' && source.preferredView ? source.preferredView : DEFAULT_TEACHER_SCHEDULE_SETTINGS.preferredView
        };
    }

    function migrateStoredStateIfNeeded(storage = getDefaultStorage()) {
        if (!storage) return false;

        const rawValue = storage.getItem(TEACHER_SCHEDULE_KEY);
        if (!rawValue) return false;

        let parsed;
        try {
            parsed = JSON.parse(rawValue);
        } catch (error) {
            return false;
        }

        if (!isPlainObject(parsed) || parsed.version === STORAGE_VERSION) {
            return false;
        }

        writeJson(storage, TEACHER_SCHEDULE_KEY, normalizeTeacherScheduleSettings(parsed));
        return true;
    }

    function loadTeacherScheduleSettings(storage = getDefaultStorage()) {
        return normalizeTeacherScheduleSettings(readJson(storage, TEACHER_SCHEDULE_KEY));
    }

    function saveTeacherScheduleSettings(settings, storage = getDefaultStorage()) {
        writeJson(storage, TEACHER_SCHEDULE_KEY, normalizeTeacherScheduleSettings(settings));
    }

    function loadImportedCalendarState(storage = getDefaultStorage()) {
        const importedCalendarData = readJson(storage, IMPORTED_CALENDAR_KEY);
        const useImportedData = storage ? storage.getItem(USE_IMPORTED_DATA_KEY) === 'true' : false;

        return {
            importedCalendarData: isPlainObject(importedCalendarData) ? importedCalendarData : {},
            useImportedData
        };
    }

    function saveImportedCalendarState(state, storage = getDefaultStorage()) {
        const importedCalendarData = isPlainObject(state && state.importedCalendarData) ? state.importedCalendarData : {};
        const useImportedData = Boolean(state && state.useImportedData);

        writeJson(storage, IMPORTED_CALENDAR_KEY, importedCalendarData);
        if (storage) {
            storage.setItem(USE_IMPORTED_DATA_KEY, useImportedData ? 'true' : 'false');
        }
    }

    function clearImportedCalendarState(storage = getDefaultStorage()) {
        if (!storage) return;
        storage.removeItem(IMPORTED_CALENDAR_KEY);
        storage.removeItem(USE_IMPORTED_DATA_KEY);
    }

    function loadDateRange(storage = getDefaultStorage()) {
        return {
            startDate: storage ? storage.getItem(DATE_RANGE_START_KEY) || '' : '',
            endDate: storage ? storage.getItem(DATE_RANGE_END_KEY) || '' : ''
        };
    }

    function saveDateRange(range, storage = getDefaultStorage()) {
        if (!storage) return;
        storage.setItem(DATE_RANGE_START_KEY, (range && range.startDate) || '');
        storage.setItem(DATE_RANGE_END_KEY, (range && range.endDate) || '');
    }

    function clearDateRange(storage = getDefaultStorage()) {
        if (!storage) return;
        storage.removeItem(DATE_RANGE_START_KEY);
        storage.removeItem(DATE_RANGE_END_KEY);
    }

    return {
        STORAGE_VERSION,
        DEFAULT_TEACHER_SCHEDULE_SETTINGS,
        loadTeacherScheduleSettings,
        saveTeacherScheduleSettings,
        loadImportedCalendarState,
        saveImportedCalendarState,
        clearImportedCalendarState,
        loadDateRange,
        saveDateRange,
        clearDateRange,
        migrateStoredStateIfNeeded
    };
});
