(function (root, factory) {
    const parser = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = parser;
    }

    if (root) {
        root.TeacherScheduleParser = parser;
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    const DAY_LETTERS = ['A', 'B', 'C', 'D'];
    const NON_TEACHING_PATTERNS = [/common planning time/i, /planning time/i];

    function buildBlockCode(day, slot) {
        return ['HR', 'FX', 'ELB'].includes(slot) ? `${day}-${slot}` : `${day}${slot}`;
    }

    function expandDaySpec(spec) {
        const cleaned = (spec || '').replace(/\s+/g, '');
        const result = new Set();

        cleaned.split(',').forEach(part => {
            if (!part) return;
            const rangeMatch = part.match(/^([A-D])-([A-D])$/i);
            if (rangeMatch) {
                const start = DAY_LETTERS.indexOf(rangeMatch[1].toUpperCase());
                const end = DAY_LETTERS.indexOf(rangeMatch[2].toUpperCase());
                if (start !== -1 && end !== -1) {
                    const [lo, hi] = start <= end ? [start, end] : [end, start];
                    for (let i = lo; i <= hi; i++) {
                        result.add(DAY_LETTERS[i]);
                    }
                }
                return;
            }

            const singleMatch = part.match(/^([A-D])$/i);
            if (singleMatch) {
                result.add(singleMatch[1].toUpperCase());
            }
        });

        return Array.from(result);
    }

    function normalizeTeacherScheduleText(rawText) {
        return rawText
            .replace(/[–—−￾－]/g, '-')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function detectSchedulePdfFormat(rawText) {
        const normalized = normalizeTeacherScheduleText(rawText).toLowerCase();
        const hasAdminTitle = normalized.includes('teacher schedule -');
        const hasAdminHeader = /expression\s+term\s+course\s+#\s+course\s+sec\s+#\s+room\s+enrollment/.test(normalized);
        const hasGridHeader = /day\s+terms\s+hr\s+1\s+2\s+3\s+4\s+fx\s+elb\s+5/.test(normalized);

        if (hasAdminTitle && hasAdminHeader) return 'admin-table';
        if (hasGridHeader) return 'grid';
        return 'unknown';
    }

    function extractCourseName(rowText) {
        return extractBlockMetadata(rowText, rowText, '').title;
    }

    function extractRoom(text) {
        const roomMatch = (text || '').match(/Room:\s*([A-Z]\d{3}|\d+[A-Z]?|[A-Z]\d*)/i)
            || (text || '').match(/\b([A-Z]\d{3})\b/i);
        return roomMatch ? roomMatch[1].toUpperCase() : '';
    }

    function normalizeTitle(text) {
        const titlePatterns = [
            /Common\s+Planning\s+Time/i,
            /Extended\s+Learning\s+Block/i,
            /IB\s+Math\s+AI\s+HL\s+Y1/i,
            /IB\s+Math\s+AI\s+HL\s+Y2/i,
            /Accelerated\s+Math\s+9/i,
            /Homeroom\s+10/i,
            /Advisory\s+10/i,
            /Data\s+Science/i
        ];

        for (const pattern of titlePatterns) {
            const match = (text || '').match(pattern);
            if (match) {
                return match[0].replace(/\s+/g, ' ').trim();
            }
        }

        const cleaned = (text || '')
            .replace(/^(HR|ELB|FX|[1-5])\([^)]+\)\s*/i, '')
            .replace(/^(25-26|S1|S2)\s*/i, '')
            .replace(/^\d+\/\d+\s*/i, '')
            .replace(/\b[A-Z]{3,}\d+\s*\.\s*\d+[A-Z]?\b.*$/i, '')
            .replace(/\bRoom:\s*.*$/i, '')
            .trim();

        return cleaned;
    }

    function classifyBlock(slot, title, isNonTeaching) {
        if (isNonTeaching || /common planning time|planning time/i.test(title)) return 'planning';
        if (slot === 'HR' || /homeroom/i.test(title)) return 'homeroom';
        if (slot === 'ELB' || /extended learning block/i.test(title)) return 'elb';
        if (slot === 'FX' || /advisory/i.test(title)) return 'advisory';
        if (title) return 'teaching';
        return 'other';
    }

    function extractBlockMetadata(rowText, contextText, expressionText) {
        const context = contextText || rowText || '';
        const expressionIndex = expressionText ? context.indexOf(expressionText) : -1;
        const beforeExpression = expressionIndex >= 0 ? context.slice(0, expressionIndex) : '';
        const afterExpression = expressionIndex >= 0 ? context.slice(expressionIndex + expressionText.length) : rowText;
        const candidates = [beforeExpression, afterExpression, rowText, context].filter(Boolean);

        for (const candidate of candidates) {
            const title = normalizeTitle(candidate);
            if (title) {
                return {
                    title,
                    room: extractRoom(candidate)
                };
            }
        }

        return {
            title: '',
            room: extractRoom(context)
        };
    }

    function parseTeacherScheduleText(rawText) {
        const normalized = normalizeTeacherScheduleText(rawText);
        const format = detectSchedulePdfFormat(rawText);
        const expressionRegex = /\b(HR|ELB|FX|[1-5])\(([A-D,\-\s]+)\)/g;
        const matches = Array.from(normalized.matchAll(expressionRegex));

        if (!matches.length) {
            throw new Error('No schedule expressions like 3(A,C-D) were found in the PDF.');
        }

        const selectedCodes = new Set();
        const assignments = {};
        const blockMap = new Map();
        const ignoredBlockMap = new Map();
        const warnings = [];
        let ignoredPlanningBlocks = 0;

        matches.forEach((match, index) => {
            const slot = match[1].toUpperCase();
            const daySpec = match[2];
            const expressionText = match[0];
            const previousMatchEnd = index > 0 ? matches[index - 1].index + matches[index - 1][0].length : 0;
            const rowStart = match.index;
            const rowEnd = index < matches.length - 1 ? matches[index + 1].index : normalized.length;
            const rowText = normalized.slice(rowStart, rowEnd).trim();
            const contextText = format === 'admin-table' ? rowText : normalized.slice(previousMatchEnd, rowEnd).trim();
            const metadata = extractBlockMetadata(rowText, contextText, expressionText);
            const isNonTeaching = NON_TEACHING_PATTERNS.some(pattern => pattern.test(metadata.title));
            const category = classifyBlock(slot, metadata.title, isNonTeaching);
            const days = expandDaySpec(daySpec);

            days.forEach(day => {
                const code = buildBlockCode(day, slot);
                const blockMetadata = {
                    blockCode: code,
                    category,
                    title: metadata.title,
                    room: metadata.room,
                    sourceText: contextText
                };

                if (category !== 'planning') {
                    selectedCodes.add(code);
                    if (metadata.title && !assignments[code]) {
                        assignments[code] = metadata.title;
                    }
                    if (!blockMap.has(code)) {
                        blockMap.set(code, blockMetadata);
                    }
                } else {
                    ignoredPlanningBlocks += 1;
                    if (!ignoredBlockMap.has(code)) {
                        ignoredBlockMap.set(code, blockMetadata);
                    }
                }
            });
        });

        return {
            format,
            selectedCodes: Array.from(selectedCodes),
            assignments,
            blocks: Array.from(blockMap.values()),
            ignoredBlocks: Array.from(ignoredBlockMap.values()),
            ignoredPlanningBlocks,
            expressionCount: matches.length,
            rawMatches: matches.map((match, index) => {
                const slot = match[1].toUpperCase();
                const daySpec = match[2];
                const expressionText = match[0];
                const previousMatchEnd = index > 0 ? matches[index - 1].index + matches[index - 1][0].length : 0;
                const rowStart = match.index;
                const rowEnd = index < matches.length - 1 ? matches[index + 1].index : normalized.length;
                const rowText = normalized.slice(rowStart, rowEnd).trim();
                const contextText = format === 'admin-table' ? rowText : normalized.slice(previousMatchEnd, rowEnd).trim();
                const metadata = extractBlockMetadata(rowText, contextText, expressionText);
                const isNonTeaching = NON_TEACHING_PATTERNS.some(pattern => pattern.test(metadata.title));
                return {
                    expression: expressionText,
                    slot,
                    daySpec,
                    title: metadata.title,
                    room: metadata.room,
                    category: classifyBlock(slot, metadata.title, isNonTeaching),
                    sourceText: contextText
                };
            }),
            warnings
        };
    }

    return {
        DAY_LETTERS,
        NON_TEACHING_PATTERNS,
        buildBlockCode,
        expandDaySpec,
        normalizeTeacherScheduleText,
        detectSchedulePdfFormat,
        extractCourseName,
        extractRoom,
        classifyBlock,
        extractBlockMetadata,
        parseTeacherScheduleText
    };
});
