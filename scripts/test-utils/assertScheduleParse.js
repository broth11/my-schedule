function sortCodes(codes) {
    return Array.from(codes).sort();
}

function listOrNone(items) {
    return items.length ? items.join(', ') : 'none';
}

function difference(left, right) {
    const rightSet = new Set(right);
    return sortCodes(left).filter(code => !rightSet.has(code));
}

function blockMap(parsed) {
    return new Map((parsed.blocks || []).map(block => [block.blockCode, block]));
}

function ignoredBlockMap(parsed) {
    return new Map((parsed.ignoredBlocks || []).map(block => [block.blockCode, block]));
}

function findDuplicates(blocks) {
    const seen = new Set();
    const duplicates = new Set();

    blocks.forEach(block => {
        if (seen.has(block.blockCode)) {
            duplicates.add(block.blockCode);
            return;
        }
        seen.add(block.blockCode);
    });

    return Array.from(duplicates).sort();
}

function checkExpectedTeachingBlocks(parsed, expectedTeachingBlocks) {
    const selectedCodes = parsed?.selectedCodes || [];
    return {
        missingExpectedBlocks: difference(expectedTeachingBlocks, selectedCodes),
        unexpectedTeachingBlocks: difference(selectedCodes, expectedTeachingBlocks)
    };
}

function checkPlanningBlock(parsed, blockCode = 'D2') {
    const selectedCodes = new Set(parsed?.selectedCodes || []);
    const ignored = ignoredBlockMap(parsed).get(blockCode);

    return {
        isTeaching: selectedCodes.has(blockCode),
        ignored
    };
}

function checkMetadata(parsed, expectedMetadata, expectedIgnoredMetadata) {
    const blocks = blockMap(parsed);
    const ignoredBlocks = ignoredBlockMap(parsed);
    const missingExpectedTitles = [];
    const missingExpectedRooms = [];
    const categoryMismatches = [];

    Object.entries(expectedMetadata).forEach(([code, expected]) => {
        const block = blocks.get(code);
        if (!block || block.title !== expected.title) {
            missingExpectedTitles.push(`${code}:${expected.title}`);
        }
        if (!block || block.room !== expected.room) {
            missingExpectedRooms.push(`${code}:${expected.room || '(blank)'}`);
        }
        if (!block || block.category !== expected.category) {
            categoryMismatches.push(`${code}:${block?.category || 'missing'}!=${expected.category}`);
        }
    });

    Object.entries(expectedIgnoredMetadata).forEach(([code, expected]) => {
        const block = ignoredBlocks.get(code);
        if (!block || block.title !== expected.title) {
            missingExpectedTitles.push(`${code}:${expected.title}`);
        }
        if (!block || block.room !== expected.room) {
            missingExpectedRooms.push(`${code}:${expected.room || '(blank)'}`);
        }
        if (!block || block.category !== expected.category) {
            categoryMismatches.push(`${code}:${block?.category || 'missing'}!=${expected.category}`);
        }
    });

    return {
        missingExpectedTitles,
        missingExpectedRooms,
        categoryMismatches,
        duplicateFinalBlocks: findDuplicates(parsed.blocks || [])
    };
}

module.exports = {
    sortCodes,
    listOrNone,
    difference,
    blockMap,
    ignoredBlockMap,
    findDuplicates,
    checkExpectedTeachingBlocks,
    checkPlanningBlock,
    checkMetadata
};
