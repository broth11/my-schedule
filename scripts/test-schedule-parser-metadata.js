const fs = require('fs');
const path = require('path');
const parser = require('../src/schedule/teacherScheduleParser');
const {
    EXPECTED_METADATA,
    EXPECTED_IGNORED_METADATA
} = require('./test-utils/scheduleExpectations');
const {
    checkMetadata,
    listOrNone
} = require('./test-utils/assertScheduleParse');

const sources = [
    {
        name: 'fixture',
        path: path.join(__dirname, '..', 'samples', 'schedule-ben.fixture.txt')
    },
    {
        name: 'real PDF',
        path: path.join(__dirname, '..', 'tmp', 'schedule-ben.extracted.txt')
    }
];

function runSource(source) {
    const rawText = fs.readFileSync(source.path, 'utf8');
    const parsed = parser.parseTeacherScheduleText(rawText);
    const {
        missingExpectedTitles,
        missingExpectedRooms,
        categoryMismatches,
        duplicateFinalBlocks
    } = checkMetadata(parsed, EXPECTED_METADATA, EXPECTED_IGNORED_METADATA);

    console.log(`Metadata test source: ${source.name}`);
    console.log(`Teaching block metadata count: ${parsed.blocks.length}`);
    console.log(`Ignored/planning metadata count: ${parsed.ignoredBlocks.length}`);
    console.log(`Missing expected titles: ${listOrNone(missingExpectedTitles)}`);
    console.log(`Missing expected rooms: ${listOrNone(missingExpectedRooms)}`);
    console.log(`Category mismatches: ${listOrNone(categoryMismatches)}`);
    console.log(`Duplicate final blocks: ${listOrNone(duplicateFinalBlocks)}`);

    if (
        missingExpectedTitles.length ||
        missingExpectedRooms.length ||
        categoryMismatches.length ||
        duplicateFinalBlocks.length
    ) {
        process.exitCode = 1;
    }
}

sources.forEach((source, index) => {
    if (!fs.existsSync(source.path)) {
        if (source.name === 'real PDF') {
            console.error(`Missing extracted text: ${source.path}`);
            console.error('Run `npm run test:schedule-parser:pdf` first to generate extracted PDF text.');
            process.exitCode = 1;
            return;
        }
        console.error(`Missing fixture: ${source.path}`);
        process.exitCode = 1;
        return;
    }
    if (index > 0) console.log('');
    runSource(source);
});
