const fs = require('fs');
const path = require('path');
const parser = require('../src/schedule/teacherScheduleParser');
const { extractTextFromPdfFile } = require('./test-utils/pdfText');
const {
    EXPECTED_TEACHING_BLOCKS,
    EXPECTED_ASSIGNMENTS,
    EXPECTED_ROOM
} = require('./test-utils/scheduleExpectations');
const {
    sortCodes,
    listOrNone,
    difference,
    blockMap
} = require('./test-utils/assertScheduleParse');

const rootDir = path.join(__dirname, '..');
const gridPdfPath = path.join(rootDir, 'samples', 'schedule-ben.pdf');
const adminPdfPath = path.join(rootDir, 'Teacher Schedule - Roth, Benjamin 2500.pdf');
const tmpDir = path.join(rootDir, 'tmp');
const gridExtractedPath = path.join(tmpDir, 'schedule-ben.grid.extracted.txt');
const adminExtractedPath = path.join(tmpDir, 'schedule-ben.admin.extracted.txt');

function compareMetadata(gridParsed, adminParsed) {
    const gridBlocks = blockMap(gridParsed);
    const adminBlocks = blockMap(adminParsed);
    const assignmentWarnings = [];
    const roomWarnings = [];

    EXPECTED_TEACHING_BLOCKS.forEach(code => {
        const expectedTitle = EXPECTED_ASSIGNMENTS[code];
        const gridBlock = gridBlocks.get(code);
        const adminBlock = adminBlocks.get(code);

        if (gridBlock?.title !== expectedTitle) {
            assignmentWarnings.push(`grid ${code}:${gridBlock?.title || 'missing'}!=${expectedTitle}`);
        }
        if (adminBlock?.title !== expectedTitle) {
            assignmentWarnings.push(`admin ${code}:${adminBlock?.title || 'missing'}!=${expectedTitle}`);
        }
        if (gridBlock?.title && adminBlock?.title && gridBlock.title !== adminBlock.title) {
            assignmentWarnings.push(`${code}:grid ${gridBlock.title}!=admin ${adminBlock.title}`);
        }
        if (gridBlock?.room !== EXPECTED_ROOM) {
            roomWarnings.push(`grid ${code}:${gridBlock?.room || '(blank)'}!=${EXPECTED_ROOM}`);
        }
        if (adminBlock?.room !== EXPECTED_ROOM) {
            roomWarnings.push(`admin ${code}:${adminBlock?.room || '(blank)'}!=${EXPECTED_ROOM}`);
        }
    });

    const gridIgnoredD2 = gridParsed.ignoredBlocks.find(block => block.blockCode === 'D2');
    const adminIgnoredD2 = adminParsed.ignoredBlocks.find(block => block.blockCode === 'D2');

    if (gridIgnoredD2?.title !== 'Common Planning Time') {
        assignmentWarnings.push(`grid D2 ignored:${gridIgnoredD2?.title || 'missing'}!=Common Planning Time`);
    }
    if (adminIgnoredD2?.title !== 'Common Planning Time') {
        assignmentWarnings.push(`admin D2 ignored:${adminIgnoredD2?.title || 'missing'}!=Common Planning Time`);
    }

    return { assignmentWarnings, roomWarnings };
}

async function main() {
    fs.mkdirSync(tmpDir, { recursive: true });

    const gridText = await extractTextFromPdfFile(gridPdfPath);
    const adminText = await extractTextFromPdfFile(adminPdfPath);
    fs.writeFileSync(gridExtractedPath, gridText, 'utf8');
    fs.writeFileSync(adminExtractedPath, adminText, 'utf8');

    const gridParsed = parser.parseTeacherScheduleText(gridText);
    const adminParsed = parser.parseTeacherScheduleText(adminText);
    const gridSet = new Set(gridParsed.selectedCodes);
    const adminSet = new Set(adminParsed.selectedCodes);
    const expectedSet = new Set(EXPECTED_TEACHING_BLOCKS);
    const shared = sortCodes(gridParsed.selectedCodes).filter(code => adminSet.has(code));

    const missingFromGrid = difference(EXPECTED_TEACHING_BLOCKS, gridParsed.selectedCodes);
    const missingFromAdmin = difference(EXPECTED_TEACHING_BLOCKS, adminParsed.selectedCodes);
    const unexpectedInGrid = difference(gridParsed.selectedCodes, EXPECTED_TEACHING_BLOCKS);
    const unexpectedInAdmin = difference(adminParsed.selectedCodes, EXPECTED_TEACHING_BLOCKS);
    const gridOnly = difference(gridParsed.selectedCodes, adminParsed.selectedCodes);
    const adminOnly = difference(adminParsed.selectedCodes, gridParsed.selectedCodes);
    const d2TeachingPassed = !gridSet.has('D2') && !adminSet.has('D2');
    const { assignmentWarnings, roomWarnings } = compareMetadata(gridParsed, adminParsed);

    console.log(`Grid PDF format: ${gridParsed.format}`);
    console.log(`Admin PDF format: ${adminParsed.format}`);
    console.log('');
    console.log(`Grid teaching blocks: ${gridParsed.selectedCodes.length}`);
    console.log(`Admin teaching blocks: ${adminParsed.selectedCodes.length}`);
    console.log(`Shared teaching blocks: ${shared.length}`);
    console.log('');
    console.log(`Missing from grid: ${listOrNone(missingFromGrid)}`);
    console.log(`Missing from admin: ${listOrNone(missingFromAdmin)}`);
    console.log(`Unexpected in grid: ${listOrNone(unexpectedInGrid)}`);
    console.log(`Unexpected in admin: ${listOrNone(unexpectedInAdmin)}`);
    console.log(`Grid/admin set mismatch: ${listOrNone([...gridOnly.map(code => `grid-only ${code}`), ...adminOnly.map(code => `admin-only ${code}`)])}`);
    console.log('');
    console.log(`D2 teaching check: ${d2TeachingPassed ? 'passed' : 'failed'}`);
    console.log(`Assignment comparison: ${assignmentWarnings.length ? `warnings listed (${assignmentWarnings.join('; ')})` : 'passed'}`);
    console.log(`Room comparison: ${roomWarnings.length ? `warnings listed (${roomWarnings.join('; ')})` : 'passed'}`);
    console.log(`Grid extracted text: ${path.relative(rootDir, gridExtractedPath)}`);
    console.log(`Admin extracted text: ${path.relative(rootDir, adminExtractedPath)}`);

    if (gridParsed.format !== 'grid') {
        console.error(`Format detection failed for grid PDF: ${gridParsed.format}`);
        process.exitCode = 1;
    }
    if (adminParsed.format !== 'admin-table') {
        console.error(`Format detection failed for admin PDF: ${adminParsed.format}`);
        process.exitCode = 1;
    }
    if (missingFromGrid.length || missingFromAdmin.length || unexpectedInGrid.length || unexpectedInAdmin.length) {
        console.error('Block expansion comparison failed.');
        process.exitCode = 1;
    }
    if (gridOnly.length || adminOnly.length) {
        console.error('Grid/admin selected block sets do not match.');
        process.exitCode = 1;
    }
    if (!d2TeachingPassed) {
        console.error('Planning detection failed: D2 was counted as teaching.');
        process.exitCode = 1;
    }
    if (assignmentWarnings.length || roomWarnings.length) {
        console.error('Metadata comparison failed.');
        process.exitCode = 1;
    }
    if (shared.length !== expectedSet.size) {
        console.error(`Shared block count mismatch: expected ${expectedSet.size}, got ${shared.length}.`);
        process.exitCode = 1;
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
