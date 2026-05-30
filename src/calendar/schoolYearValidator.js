const ALLOWED_CYCLES = new Set([
    'A1', 'A2', 'A3', 'A4', 'A5',
    'B1', 'B2', 'B3', 'B4', 'B5',
    'C1', 'C2', 'C3', 'C4', 'C5',
    'D1', 'D2', 'D3', 'D4', 'D5',
    'HOLIDAY',
    'IN-SERVICE',
    'PTC',
    'SONGKRAN',
    'HALF DAY',
    'BREAK',
    'NO SCHOOL'
]);

const DAY_LABELS = new Set(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

function validateSchoolYearData(data) {
    const errors = [];
    const warnings = [];

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return {
            months: 0,
            days: 0,
            errors: ['Top-level value must be an object keyed by YYYY-MM.'],
            warnings
        };
    }

    const monthKeys = Object.keys(data);
    let dayCount = 0;

    monthKeys.forEach(monthKey => {
        if (!/^\d{4}-\d{2}$/.test(monthKey)) {
            errors.push(`Invalid month key: ${monthKey}`);
        }

        const days = data[monthKey];
        if (!Array.isArray(days)) {
            errors.push(`Month ${monthKey} must be an array.`);
            return;
        }

        const seenDates = new Set();
        const [yearText, monthText] = monthKey.split('-');
        const year = Number(yearText);
        const month = Number(monthText);
        const lastDay = new Date(year, month, 0).getDate();

        days.forEach((dayObj, index) => {
            dayCount += 1;
            const label = `${monthKey}[${index}]`;

            if (!dayObj || typeof dayObj !== 'object' || Array.isArray(dayObj)) {
                errors.push(`${label} must be an object.`);
                return;
            }

            if (!Number.isInteger(dayObj.date)) {
                errors.push(`${label}.date must be an integer.`);
            } else {
                if (dayObj.date < 1 || dayObj.date > lastDay) {
                    errors.push(`${label}.date ${dayObj.date} is outside ${monthKey}.`);
                }
                if (seenDates.has(dayObj.date)) {
                    errors.push(`${monthKey} has duplicate date ${dayObj.date}.`);
                }
                seenDates.add(dayObj.date);
            }

            if (typeof dayObj.day !== 'string' || !dayObj.day.trim()) {
                errors.push(`${label}.day must be a non-empty string.`);
            } else if (!DAY_LABELS.has(dayObj.day)) {
                warnings.push(`${label}.day has unexpected label: ${dayObj.day}`);
            }

            if (typeof dayObj.cycle !== 'string' || !dayObj.cycle.trim()) {
                errors.push(`${label}.cycle must be a non-empty string.`);
            } else if (!ALLOWED_CYCLES.has(dayObj.cycle)) {
                errors.push(`${label}.cycle has invalid label: ${dayObj.cycle}`);
            }

            if ('note' in dayObj && typeof dayObj.note !== 'string') {
                errors.push(`${label}.note must be a string when present.`);
            }
        });
    });

    return {
        months: monthKeys.length,
        days: dayCount,
        errors,
        warnings
    };
}

function parseAndValidateSchoolYearJson(content) {
    try {
        return validateSchoolYearData(JSON.parse(content));
    } catch (error) {
        return {
            months: 0,
            days: 0,
            errors: [`Invalid JSON: ${error.message}`],
            warnings: []
        };
    }
}

module.exports = {
    ALLOWED_CYCLES,
    validateSchoolYearData,
    parseAndValidateSchoolYearJson
};
