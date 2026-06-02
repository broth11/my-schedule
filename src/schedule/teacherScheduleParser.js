(function (root, factory) {
    const blockModel = (root && root.ScheduleBlockModel)
        || (typeof require === 'function' ? require('./blockModel') : null);
    const parser = factory(blockModel);

    if (typeof module === 'object' && module.exports) {
        module.exports = parser;
    }

    if (root) {
        root.TeacherScheduleParser = parser;
    }
})(typeof window !== 'undefined' ? window : globalThis, function (blockModel) {
    const {
        DAY_LETTERS,
        buildBlockCode,
        detectPrimaryScheduleBlockModel,
        normalizeBlockCodeForModel
    } = blockModel;
    const NON_TEACHING_PATTERNS = [/common planning time/i, /planning time/i];

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

    function extractTeacherName(rawText) {
        const normalized = normalizeTeacherScheduleText(rawText);
        const match = normalized.match(/\bTeacher Schedule\s*-\s*([^0-9]+?)\s*(?:\d{3,}|\bExpression\b|\bTerm\b|$)/i);
        if (!match) return '';
        const rawName = match[1].replace(/\s+/g, ' ').trim();
        const parts = rawName.split(',').map(part => part.trim()).filter(Boolean);
        if (parts.length >= 2) {
            return `${parts.slice(1).join(' ')} ${parts[0]}`.replace(/\s+/g, ' ').trim();
        }
        return rawName;
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
            .replace(/^(HR|ELB|FX|SB|FXSB|AS|[1-5])\([^)]+\)\s*/i, '')
            .replace(/^(25-26|S1|S2)\s*/i, '')
            .replace(/^\d+\/\d+\s*/i, '')
            .replace(/\b[A-Z]{3,}\d+\s*\.\s*\d+[A-Z]?\b.*$/i, '')
            .replace(/\bRoom:\s*.*$/i, '')
            .trim();

        return cleaned;
    }

    function normalizeListTitle(text) {
        return (text || '')
            .replace(/\b(?:locked|lock|attendance)\b/gi, ' ')
            .replace(/\bNo terms for this section are locked\b/gi, ' ')
            .replace(/\b(?:HS|MS)-Ruamrudee International School\b/gi, ' ')
            .replace(/\bLegend\b/gi, ' ')
            .replace(/\bIcons\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function classifyBlock(slot, title, isNonTeaching) {
        if (isNonTeaching || /common planning time|planning time/i.test(title)) return 'planning';
        if (slot === 'AS') return 'after-school';
        if (/team meeting|plt/i.test(title)) return 'meeting';
        if (/coverage/i.test(title)) return 'coverage';
        if (slot === 'ADV' || /advisory/i.test(title)) return 'advisory';
        if (slot === 'HR' || /homeroom|house home/i.test(title)) return 'homeroom';
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

    const EXPRESSION_TOKEN_PATTERN = '(?:ADV|FXB|FX[1-5]|HR|ELB|FXSB|FX|SB|AS|[1-5])';
    const LIST_EXPRESSION_REGEX = new RegExp(`\\b${EXPRESSION_TOKEN_PATTERN}\\([A-D,\\-\\s]+\\)`, 'gi');
    const LIST_ROW_PREFIX_REGEX = new RegExp(`^(?<expression>${EXPRESSION_TOKEN_PATTERN}\\([A-D,\\-\\s]+\\))\\s+(?<term>(?:\\d{2}-\\d{2}|S[12]))\\s+(?<courseCode>[A-Z][A-Z0-9]*)\\s+(?<details>.+)$`, 'i');
    const LIST_ROOM_TOKEN_REGEX = /^(?:[A-Z]{1,4}\d{0,4}|\d{1,2}-\d+|TBD|Room:\s*\S+)$/i;
    const LIST_SECTION_TOKEN_REGEX = /^\d+[A-Z]?$/i;
    const LIST_ENROLLMENT_TOKEN_REGEX = /^\d+\/\d+$|^\d+$/;

    const BARE_EXPRESSION_REGEX = new RegExp(`^${EXPRESSION_TOKEN_PATTERN}\\([A-D,\\-\\s]+\\)$`, 'i');

    function parseExpression(expression) {
        const parsedExpression = (expression || '').match(new RegExp(`^(${EXPRESSION_TOKEN_PATTERN})\\(([A-D,\\-\\s]+)\\)$`, 'i'));
        if (!parsedExpression) return null;

        const rawSlot = parsedExpression[1].toUpperCase();
        const fxNumberMatch = rawSlot.match(/^FX([1-5])$/);
        return {
            expression,
            rawSlot,
            slot: fxNumberMatch ? 'FX' : rawSlot,
            daySpec: parsedExpression[2],
            cycleSlotConstraint: fxNumberMatch ? fxNumberMatch[1] : ''
        };
    }

    function buildRowFromRegexMatch(match, sourceText) {
        const groups = match.groups || {};
        const parsedExpression = parseExpression(groups.expression || '');
        const slot = parsedExpression ? parsedExpression.slot : '';
        const rawSlot = parsedExpression ? parsedExpression.rawSlot : '';
        const daySpec = parsedExpression ? parsedExpression.daySpec : '';
        // Truncate details at any non-standard expression-like token (e.g. "SB(A,C) S2 ...")
        // This prevents rows for unknown expression types from bleeding into adjacent rows.
        const detailTokens = (groups.details || '').trim()
            .replace(/\s+[A-Z]{2,}\([A-D,\-\s]+\)\s.*$/i, '')
            .split(/\s+/).filter(Boolean);
        let enrollment = '';
        let room = '';
        let section = '';

        // Strip school name suffix (e.g. "HS-Ruamrudee International School") before right-to-left extraction
        if (detailTokens.length >= 3) {
            const lastThree = detailTokens.slice(-3).join(' ');
            if (/^(?:HS|MS)-\w+\s+International\s+School$/i.test(lastThree)) {
                detailTokens.splice(-3);
            }
        }

        if (detailTokens.length && LIST_ENROLLMENT_TOKEN_REGEX.test(detailTokens[detailTokens.length - 1])) {
            enrollment = detailTokens.pop();
        }
        if (detailTokens.length && LIST_ROOM_TOKEN_REGEX.test(detailTokens[detailTokens.length - 1])) {
            room = detailTokens.pop().replace(/^Room:\s*/i, '').toUpperCase();
        }
        if (detailTokens.length && LIST_SECTION_TOKEN_REGEX.test(detailTokens[detailTokens.length - 1])) {
            section = detailTokens.pop();
        }

        const title = normalizeListTitle(detailTokens.join(' '));
        const isNonTeaching = NON_TEACHING_PATTERNS.some(pattern => pattern.test(title));

        return {
            expression: groups.expression || '',
            rawSlot,
            slot,
            daySpec,
            cycleSlotConstraint: parsedExpression ? parsedExpression.cycleSlotConstraint : '',
            term: groups.term || '',
            courseCode: groups.courseCode || '',
            title,
            section,
            room,
            enrollment,
            category: classifyBlock(slot, title, isNonTeaching),
            sourceText
        };
    }

    function parseListScheduleRows(normalizedText) {
        const expressionMatches = Array.from(normalizedText.matchAll(LIST_EXPRESSION_REGEX));
        const rows = [];
        const pendingExpressions = [];

        expressionMatches.forEach((rowExpressionMatch, index) => {
            const rowStart = rowExpressionMatch.index;
            const rowEnd = index < expressionMatches.length - 1
                ? expressionMatches[index + 1].index
                : normalizedText.length;
            const sourceText = normalizedText.slice(rowStart, rowEnd)
                .replace(/\bMake all students listed above.*$/i, '')
                .replace(/\bIcons\b.*$/i, '')
                .replace(/\bExpression\s+Term\s+Course\s+#.*$/i, '')
                .replace(/\bCurrent School\b.*$/i, '')
                .replace(/\bSchool Name\b.*$/i, '')
                .replace(/\s+/g, ' ')
                .trim();

            const match = sourceText.match(LIST_ROW_PREFIX_REGEX);
            if (!match) {
                // If the slice is just a bare expression, hold it as a pending expression
                // to be attached to the next successfully-parsed row (multi-expression rows).
                if (BARE_EXPRESSION_REGEX.test(sourceText)) {
                    pendingExpressions.push(sourceText.trim());
                }
                return;
            }

            const row = buildRowFromRegexMatch(match, sourceText);
            if (!row) return;

            rows.push(row);

            // Emit extra rows for any expressions that preceded this row in the source
            // (e.g. "2(A)" immediately before "5(C) S2 ELRB6S Robotics 6 1 M106 14")
            pendingExpressions.forEach(exprText => {
                const exprMatch = parseExpression(exprText);
                if (exprMatch) {
                    rows.push({
                        ...row,
                        expression: exprText,
                        rawSlot: exprMatch.rawSlot,
                        slot: exprMatch.slot,
                        daySpec: exprMatch.daySpec,
                        cycleSlotConstraint: exprMatch.cycleSlotConstraint,
                        sourceText: exprText
                    });
                }
            });
            pendingExpressions.length = 0;
        });

        return rows.filter(row => row && row.expression && row.slot && row.daySpec && row.title);
    }

    function getEffectiveSlot(slot, modelId) {
        const normalizedSlot = String(slot || '').toUpperCase();
        if (modelId === 'ms-static-block' && ['FX', 'SB', 'FXSB'].includes(normalizedSlot)) return 'FXSB';
        return normalizedSlot;
    }

    function buildParseResult(format, parsedRows, modelId) {
        const selectedCodes = new Set();
        const assignments = {};
        const blockMap = new Map();
        const ignoredBlockMap = new Map();
        const warnings = [];
        let ignoredPlanningBlocks = 0;

        parsedRows.forEach(row => {
            const days = expandDaySpec(row.daySpec);
            const effectiveSlot = getEffectiveSlot(row.slot, modelId);
            const effectiveCategory = row.category === 'planning'
                ? 'planning'
                : classifyBlock(effectiveSlot, row.title, false);

            days.forEach(day => {
                const code = normalizeBlockCodeForModel(buildBlockCode(day, effectiveSlot), modelId);
                const cycleDayConstraints = row.cycleSlotConstraint
                    ? [`${day}${row.cycleSlotConstraint}`]
                    : [];
                const blockMetadata = {
                    blockCode: code,
                    displayBlockCode: code,
                    dayLetter: day,
                    slot: effectiveSlot,
                    rawSlot: row.rawSlot || row.slot,
                    cycleDayConstraints,
                    category: effectiveCategory,
                    title: row.title,
                    room: row.room || null,
                    section: row.section || '',
                    enrollment: row.enrollment || '',
                    courseCode: row.courseCode || '',
                    sourceText: row.sourceText
                };

                const metadataKey = [
                    code,
                    blockMetadata.title,
                    blockMetadata.room || '',
                    blockMetadata.category,
                    blockMetadata.cycleDayConstraints.join(',')
                ].join('|');

                if (effectiveCategory !== 'planning') {
                    selectedCodes.add(code);
                    if (row.title) {
                        const current = assignments[code];
                        if (Array.isArray(current)) {
                            if (!current.includes(row.title)) current.push(row.title);
                        } else if (current && current !== row.title) {
                            assignments[code] = [current, row.title];
                        } else if (!current) {
                            assignments[code] = row.title;
                        }
                    }
                    if (!blockMap.has(metadataKey)) {
                        blockMap.set(metadataKey, blockMetadata);
                    }
                } else {
                    ignoredPlanningBlocks += 1;
                    if (!ignoredBlockMap.has(metadataKey)) {
                        ignoredBlockMap.set(metadataKey, blockMetadata);
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
            expressionCount: parsedRows.length,
            rawMatches: parsedRows.map(row => ({
                expression: row.expression,
                rawSlot: row.rawSlot || row.slot,
                slot: row.slot,
                daySpec: row.daySpec,
                cycleSlotConstraint: row.cycleSlotConstraint || '',
                term: row.term || '',
                courseCode: row.courseCode || '',
                title: row.title,
                section: row.section || '',
                room: row.room,
                enrollment: row.enrollment || '',
                category: row.category,
                sourceText: row.sourceText
            })),
            warnings
        };
    }

    function parseTeacherScheduleText(rawText) {
        const normalized = normalizeTeacherScheduleText(rawText);
        const format = detectSchedulePdfFormat(rawText);
        const teacherName = extractTeacherName(rawText);
        let parsedRows = [];
        if (format === 'admin-table') {
            const listRows = parseListScheduleRows(normalized);
            if (listRows.length) {
                parsedRows = listRows;
                const primaryScheduleBlockModel = detectPrimaryScheduleBlockModel(normalized, parsedRows);
                return {
                    ...buildParseResult(format, parsedRows, primaryScheduleBlockModel),
                    teacherName,
                    primaryScheduleBlockModel
                };
            }
        }

        const expressionRegex = new RegExp(`\\b(${EXPRESSION_TOKEN_PATTERN})\\(([A-D,\\-\\s]+)\\)`, 'g');
        const matches = Array.from(normalized.matchAll(expressionRegex));

        if (!matches.length) {
            throw new Error('No schedule expressions like 3(A,C-D) were found in the PDF.');
        }

        parsedRows = matches.map((match, index) => {
            const expressionText = match[0];
            const parsedExpression = parseExpression(expressionText);
            const slot = parsedExpression ? parsedExpression.slot : match[1].toUpperCase();
            const rawSlot = parsedExpression ? parsedExpression.rawSlot : match[1].toUpperCase();
            const daySpec = parsedExpression ? parsedExpression.daySpec : match[2];
            const previousMatchEnd = index > 0 ? matches[index - 1].index + matches[index - 1][0].length : 0;
            const rowStart = match.index;
            const rowEnd = index < matches.length - 1 ? matches[index + 1].index : normalized.length;
            const rowText = normalized.slice(rowStart, rowEnd).trim();
            const contextText = format === 'admin-table' ? rowText : normalized.slice(previousMatchEnd, rowEnd).trim();
            const metadata = extractBlockMetadata(rowText, contextText, expressionText);
            const isNonTeaching = NON_TEACHING_PATTERNS.some(pattern => pattern.test(metadata.title));
            const category = classifyBlock(slot, metadata.title, isNonTeaching);

            return {
                expression: expressionText,
                rawSlot,
                slot,
                daySpec,
                cycleSlotConstraint: parsedExpression ? parsedExpression.cycleSlotConstraint : '',
                title: metadata.title,
                room: metadata.room,
                category,
                sourceText: contextText
            };
        });

        const primaryScheduleBlockModel = detectPrimaryScheduleBlockModel(normalized, parsedRows);
        return {
            ...buildParseResult(format, parsedRows, primaryScheduleBlockModel),
            teacherName,
            primaryScheduleBlockModel
        };
    }

    return {
        DAY_LETTERS,
        NON_TEACHING_PATTERNS,
        buildBlockCode,
        expandDaySpec,
        normalizeTeacherScheduleText,
        detectSchedulePdfFormat,
        extractTeacherName,
        extractCourseName,
        extractRoom,
        classifyBlock,
        extractBlockMetadata,
        parseListScheduleRows,
        parseTeacherScheduleText
    };
});
