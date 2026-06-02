(function (root, factory) {
    const model = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = model;
    }

    if (root) {
        root.ScheduleBlockModel = model;
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    const DAY_LETTERS = ['A', 'B', 'C', 'D'];
    const HYPHENATED_SLOTS = new Set(['HR', 'FX', 'ELB', 'SB', 'FXSB', 'AS', 'ADV', 'FXB']);

    const SCHEDULE_BLOCK_MODELS = {
        'hs-flex-elb': {
            id: 'hs-flex-elb',
            label: 'High School',
            slots: ['1', '2', '3', '4', 'FX', 'ELB', '5']
        },
        'ms-static-block': {
            id: 'ms-static-block',
            label: 'Middle School',
            slots: ['1', '2', '3', '4', 'FXSB', '5']
        }
    };

    const DEFAULT_SCHEDULE_BLOCK_MODEL = 'hs-flex-elb';

    function normalizeModelId(modelId) {
        return SCHEDULE_BLOCK_MODELS[modelId] ? modelId : DEFAULT_SCHEDULE_BLOCK_MODEL;
    }

    function getCoreSlots(modelId) {
        return [...SCHEDULE_BLOCK_MODELS[normalizeModelId(modelId)].slots];
    }

    function buildBlockCode(day, slot) {
        const normalizedSlot = String(slot || '').toUpperCase();
        return HYPHENATED_SLOTS.has(normalizedSlot)
            ? `${day}-${normalizedSlot}`
            : `${day}${normalizedSlot}`;
    }

    function normalizeBlockCode(code) {
        return String(code || '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '-')
            .replace(/^([A-D])(?:-)?(HR|FX|ELB|SB|FXSB|AS|ADV|FXB)$/i, '$1-$2')
            .replace(/^([A-D])(?:-)?([1-5])$/i, '$1$2');
    }

    function getSlotFromCode(code) {
        const normalizedCode = normalizeBlockCode(code);
        if (!normalizedCode) return '';
        return normalizedCode.includes('-') ? normalizedCode.split('-')[1] : normalizedCode.slice(1);
    }

    function getDayLetterFromCode(code) {
        const normalizedCode = normalizeBlockCode(code);
        if (!normalizedCode) return '';
        return normalizedCode.charAt(0).toUpperCase();
    }

    function getSlotLabel(slot, context = 'compact') {
        const normalizedSlot = String(slot || '').toUpperCase();
        if (normalizedSlot === 'FX') return context === 'expanded' ? 'Flex' : 'FX';
        if (normalizedSlot === 'ELB') return 'ELB';
        if (normalizedSlot === 'SB') return context === 'expanded' ? 'Static Block' : 'SB';
        if (normalizedSlot === 'FXSB') return context === 'expanded' ? 'Flex / Static Block' : 'FX/SB';
        if (normalizedSlot === 'AS') return context === 'expanded' ? 'After School' : 'AS';
        if (normalizedSlot === 'HR') return context === 'expanded' ? 'Homeroom' : 'HR';
        if (normalizedSlot === 'ADV') return context === 'expanded' ? 'Advisory' : 'ADV';
        if (normalizedSlot === 'FXB') return context === 'expanded' ? 'Flex Block' : 'FXB';
        return normalizedSlot;
    }

    function getPeriodLabel(slot, index, context = 'expanded') {
        const normalizedSlot = String(slot || '').toUpperCase();
        const labels = ['1st', '2nd', '3rd', '4th', '5th'];
        if (/^[1-5]$/.test(normalizedSlot)) return labels[index] || `${index + 1}th`;
        return getSlotLabel(normalizedSlot, context);
    }

    function detectPrimaryScheduleBlockModel(text, parsedRows = []) {
        const source = text || '';
        const slots = new Set((parsedRows || []).map(row => row.rawSlot || row.slot));
        if (slots.has('SB') && !slots.has('ELB')) return 'ms-static-block';
        if (slots.has('ELB') && !slots.has('SB')) return 'hs-flex-elb';
        const schoolMatch = source.match(/\b(?:MS|HS)-Ruamrudee International School\b/i);
        if (schoolMatch) {
            return /^MS-/i.test(schoolMatch[0]) ? 'ms-static-block' : 'hs-flex-elb';
        }
        return DEFAULT_SCHEDULE_BLOCK_MODEL;
    }

    function normalizeBlockCodeForModel(code, modelId = DEFAULT_SCHEDULE_BLOCK_MODEL) {
        const normalizedCode = normalizeBlockCode(code);
        const day = getDayLetterFromCode(normalizedCode);
        const slot = getSlotFromCode(normalizedCode);
        if (normalizeModelId(modelId) === 'ms-static-block' && day && ['FX', 'SB', 'FXSB'].includes(slot)) {
            return buildBlockCode(day, 'FXSB');
        }
        return normalizedCode;
    }

    function getRotatedNumericSlots(cycleCode) {
        const dayLetter = String(cycleCode || '').trim().charAt(0).toUpperCase();
        const startSlot = String(cycleCode || '').trim().slice(dayLetter.length);
        const numericSlots = ['1', '2', '3', '4', '5'];
        const startIndex = numericSlots.indexOf(startSlot);
        return startIndex > 0
            ? [...numericSlots.slice(startIndex), ...numericSlots.slice(0, startIndex)]
            : [...numericSlots];
    }

    function getSlotsForCycle(cycleCode, modelId, hasAfterSchool = false) {
        const coreSlots = getCoreSlots(modelId);
        const numericSlots = getRotatedNumericSlots(cycleCode);
        const slots = coreSlots.map(slot => {
            if (/^[1-5]$/.test(slot)) {
                return numericSlots.shift();
            }
            return slot;
        });

        if (hasAfterSchool) {
            slots.push('AS');
        }

        return slots;
    }

    function getScheduleEntriesForCycle(cycleCode, modelId, hasAfterSchool = false, context = 'expanded') {
        const dayLetter = String(cycleCode || '').trim().charAt(0).toUpperCase();
        if (!DAY_LETTERS.includes(dayLetter)) return [];

        const rotatedNumericSlots = getRotatedNumericSlots(cycleCode);
        let academicPeriodIndex = 0;
        const entries = getCoreSlots(modelId).map(structureSlot => {
            const slot = /^[1-5]$/.test(structureSlot)
                ? rotatedNumericSlots[academicPeriodIndex]
                : structureSlot;
            const periodLabel = /^[1-5]$/.test(structureSlot)
                ? getPeriodLabel(structureSlot, academicPeriodIndex, context)
                : getPeriodLabel(structureSlot, academicPeriodIndex, context);

            if (/^[1-5]$/.test(structureSlot)) {
                academicPeriodIndex += 1;
            }

            return {
                structureSlot,
                slot,
                blockCode: buildBlockCode(dayLetter, slot),
                periodLabel,
                blockLabel: buildBlockCode(dayLetter, slot)
            };
        });

        if (hasAfterSchool) {
            entries.push({
                structureSlot: 'AS',
                slot: 'AS',
                blockCode: buildBlockCode(dayLetter, 'AS'),
                periodLabel: getPeriodLabel('AS', academicPeriodIndex, context),
                blockLabel: buildBlockCode(dayLetter, 'AS')
            });
        }

        return entries;
    }

    function getBlockCodesForCycle(cycleCode, modelId, hasAfterSchool = false) {
        return getScheduleEntriesForCycle(cycleCode, modelId, hasAfterSchool)
            .map(entry => entry.blockCode);
    }

    return {
        DAY_LETTERS,
        HYPHENATED_SLOTS,
        SCHEDULE_BLOCK_MODELS,
        DEFAULT_SCHEDULE_BLOCK_MODEL,
        normalizeModelId,
        getCoreSlots,
        buildBlockCode,
        normalizeBlockCode,
        getSlotFromCode,
        getDayLetterFromCode,
        getSlotLabel,
        getPeriodLabel,
        detectPrimaryScheduleBlockModel,
        normalizeBlockCodeForModel,
        getRotatedNumericSlots,
        getSlotsForCycle,
        getScheduleEntriesForCycle,
        getBlockCodesForCycle
    };
});
