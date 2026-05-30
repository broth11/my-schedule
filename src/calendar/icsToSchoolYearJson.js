const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function unfoldIcsLines(content) {
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
}

function parseIcsDate(value) {
    const match = String(value || '').match(/^(\d{4})(\d{2})(\d{2})/);
    if (!match) return null;
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
}

function decodeIcsText(value) {
    return String(value || '')
        .replace(/\\n/gi, ' ')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseIcsEvents(content) {
    const unfolded = unfoldIcsLines(content);
    const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];

    return blocks.map(block => {
        const event = {};
        block.split('\n').forEach(line => {
            const separator = line.indexOf(':');
            if (separator === -1) return;
            const rawName = line.slice(0, separator);
            const name = rawName.split(';')[0].toUpperCase();
            const value = line.slice(separator + 1);
            if (name === 'DTSTART') event.startDate = parseIcsDate(value);
            if (name === 'SUMMARY') event.summary = decodeIcsText(value);
            if (name === 'DESCRIPTION') event.description = decodeIcsText(value);
        });
        return event;
    }).filter(event => event.startDate && event.summary);
}

function detectCycleLabel(text) {
    const normalized = String(text || '').toUpperCase().replace(/\s+/g, ' ').trim();
    const patterns = [
        /\bDAY\s+([ABCD])[-\s]?([1-5])\b/,
        /\bCYCLE\s+DAY\s+([ABCD])[-\s]?([1-5])\b/,
        /\b([ABCD])[-\s]?([1-5])\b/
    ];

    for (const pattern of patterns) {
        const match = normalized.match(pattern);
        if (match) return `${match[1]}${match[2]}`;
    }

    return null;
}

function detectSpecialLabel(text) {
    const normalized = String(text || '').toUpperCase();
    const labels = [
        ['IN-SERVICE', /\bIN[-\s]?SERVICE\b/],
        ['PTC', /\bPTC\b|\bPARENT\s+TEACHER\b/],
        ['HALF DAY', /\bHALF\s+DAY\b/],
        ['NO SCHOOL', /\bNO\s+SCHOOL\b/],
        ['SONGKRAN', /\bSONGKRAN\b/],
        ['HOLIDAY', /\bHOLIDAY\b/],
        ['BREAK', /\bBREAK\b/]
    ];

    for (const [label, pattern] of labels) {
        if (pattern.test(normalized)) return label;
    }

    return null;
}

function monthKeyForDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function isUsefulNote(summary, cycle) {
    if (!summary || summary === cycle) return false;
    if (detectCycleLabel(summary) === cycle && summary.replace(/[-\s]/g, '').toUpperCase().includes(cycle)) {
        return false;
    }
    return true;
}

function eventsToSchoolYearJson(events) {
    const byDate = new Map();

    events.forEach(event => {
        const date = event.startDate;
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        if (!byDate.has(key)) {
            byDate.set(key, {
                date,
                cycle: null,
                special: null,
                notes: []
            });
        }

        const entry = byDate.get(key);
        const text = [event.summary, event.description].filter(Boolean).join(' ');
        const cycle = detectCycleLabel(text);
        const special = detectSpecialLabel(text);

        if (cycle) {
            entry.cycle = cycle;
            if (isUsefulNote(event.summary, cycle)) entry.notes.push(event.summary);
            return;
        }

        if (special && !entry.cycle) {
            entry.special = special;
        }

        if (isUsefulNote(event.summary, special)) {
            entry.notes.push(event.summary);
        }
    });

    const output = {};
    Array.from(byDate.values())
        .sort((a, b) => a.date - b.date)
        .forEach(entry => {
            const monthKey = monthKeyForDate(entry.date);
            if (!output[monthKey]) output[monthKey] = [];

            const notes = Array.from(new Set(entry.notes.filter(Boolean)));
            const day = {
                date: entry.date.getDate(),
                day: DAY_NAMES[entry.date.getDay()],
                cycle: entry.cycle || entry.special || 'NO SCHOOL'
            };
            if (notes.length) day.note = notes.join('; ');
            output[monthKey].push(day);
        });

    return output;
}

function convertIcsToSchoolYearJson(content) {
    return eventsToSchoolYearJson(parseIcsEvents(content));
}

module.exports = {
    convertIcsToSchoolYearJson,
    parseIcsEvents,
    detectCycleLabel,
    detectSpecialLabel
};
