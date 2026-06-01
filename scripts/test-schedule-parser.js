const fs = require('fs');
const path = require('path');
const parser = require('../src/schedule/teacherScheduleParser');
const { EXPECTED_TEACHING_BLOCKS } = require('./test-utils/scheduleExpectations');
const { checkExpectedTeachingBlocks, checkPlanningBlock } = require('./test-utils/assertScheduleParse');

const fixturePath = path.join(__dirname, '..', 'samples', 'schedule-ben.fixture.txt');
const fixtureText = fs.readFileSync(fixturePath, 'utf8');
const parsed = parser.parseTeacherScheduleText(fixtureText);
const { missingExpectedBlocks } = checkExpectedTeachingBlocks(parsed, EXPECTED_TEACHING_BLOCKS);
const planningCheck = checkPlanningBlock(parsed, 'D2');
const expectedExpressionCount = 9;
const goldingFixtureText = `
Teacher Schedule - Golding, Robert Michael 2351
Expression Term Course # Course Sec # Room Enrollment
HR(A-D) 25-26 ZHOM11 Homeroom 11 2B H402 8
1(A) 25-26 RIS102 Common Planning Time 9 12-6 0
1(B,D) 25-26 TECH416 IB Computer Science SL Y2 2 H402 2
2(B-D) 25-26 SCI442 AP Computer Science Principles 2 H402 10
3(A,C-D) 25-26 SCI442 AP Computer Science Principles 1 H402 9
4(A-B,D) 25-26 TECH419 AP Computer Science Advanced 1 H402 10
ELB(A-D) 25-26 MISC69 Extended Learning Block 28 H402 8
5(A,C) 25-26 TECH416 IB Computer Science SL Y2 1 H402 4
`;
const goldingParsed = parser.parseTeacherScheduleText(goldingFixtureText);

if (missingExpectedBlocks.length > 0) {
    console.error(`Missing expected teaching blocks: ${missingExpectedBlocks.join(', ')}`);
    process.exitCode = 1;
}

if (planningCheck.isTeaching) {
    console.error('D2 was counted as teaching, but Common Planning Time must remain planning/non-teaching.');
    process.exitCode = 1;
}

if (parsed.ignoredPlanningBlocks < 1) {
    console.error(`Expected at least 1 ignored planning block, got ${parsed.ignoredPlanningBlocks}.`);
    process.exitCode = 1;
}

if (parsed.expressionCount !== expectedExpressionCount) {
    console.error(`Expected ${expectedExpressionCount} parsed expressions, got ${parsed.expressionCount}.`);
    process.exitCode = 1;
}

function assertGoldingBlock(code, expected) {
    const blocks = new Map((goldingParsed.blocks || []).map(block => [block.blockCode, block]));
    const ignoredBlocks = new Map((goldingParsed.ignoredBlocks || []).map(block => [block.blockCode, block]));
    const block = blocks.get(code) || ignoredBlocks.get(code);

    if (!block) {
        console.error(`Golding fixture missing block ${code}.`);
        process.exitCode = 1;
        return;
    }

    ['title', 'room', 'section', 'category'].forEach(field => {
        if (block[field] !== expected[field]) {
            console.error(`Golding ${code} ${field}: expected "${expected[field]}", got "${block[field]}".`);
            process.exitCode = 1;
        }
    });

    if (!block.sourceText.includes(expected.sourceIncludes)) {
        console.error(`Golding ${code} sourceText did not preserve original row.`);
        process.exitCode = 1;
    }
}

function assertGoldingSelectedCodes(expectedCodes) {
    const selected = new Set(goldingParsed.selectedCodes || []);
    expectedCodes.forEach(code => {
        if (!selected.has(code)) {
            console.error(`Golding selected codes missing ${code}.`);
            process.exitCode = 1;
        }
    });
}

function assertGoldingIgnoredCodes(expectedCodes) {
    const ignored = new Set((goldingParsed.ignoredBlocks || []).map(block => block.blockCode));
    expectedCodes.forEach(code => {
        if (!ignored.has(code)) {
            console.error(`Golding ignored planning codes missing ${code}.`);
            process.exitCode = 1;
        }
    });
}

assertGoldingBlock('A-HR', { title: 'Homeroom 11', room: 'H402', section: '2B', category: 'homeroom', sourceIncludes: 'ZHOM11 Homeroom 11 2B H402 8' });
assertGoldingBlock('A1', { title: 'Common Planning Time', room: '12-6', section: '9', category: 'planning', sourceIncludes: 'RIS102 Common Planning Time 9 12-6 0' });
assertGoldingBlock('B1', { title: 'IB Computer Science SL Y2', room: 'H402', section: '2', category: 'teaching', sourceIncludes: 'TECH416 IB Computer Science SL Y2 2 H402 2' });
assertGoldingBlock('B2', { title: 'AP Computer Science Principles', room: 'H402', section: '2', category: 'teaching', sourceIncludes: 'SCI442 AP Computer Science Principles 2 H402 10' });
assertGoldingBlock('A3', { title: 'AP Computer Science Principles', room: 'H402', section: '1', category: 'teaching', sourceIncludes: 'SCI442 AP Computer Science Principles 1 H402 9' });
assertGoldingBlock('A4', { title: 'AP Computer Science Advanced', room: 'H402', section: '1', category: 'teaching', sourceIncludes: 'TECH419 AP Computer Science Advanced 1 H402 10' });
assertGoldingBlock('A-ELB', { title: 'Extended Learning Block', room: 'H402', section: '28', category: 'elb', sourceIncludes: 'MISC69 Extended Learning Block 28 H402 8' });
assertGoldingBlock('A5', { title: 'IB Computer Science SL Y2', room: 'H402', section: '1', category: 'teaching', sourceIncludes: 'TECH416 IB Computer Science SL Y2 1 H402 4' });

assertGoldingSelectedCodes([
    'A-HR', 'B-HR', 'C-HR', 'D-HR',
    'B1', 'D1',
    'B2', 'C2', 'D2',
    'A3', 'C3', 'D3',
    'A4', 'B4', 'D4',
    'A-ELB', 'B-ELB', 'C-ELB', 'D-ELB',
    'A5', 'C5'
]);
assertGoldingIgnoredCodes(['A1']);

(goldingParsed.blocks || []).concat(goldingParsed.ignoredBlocks || []).forEach(block => {
    if (/^(25-26|S[12])\b/.test(block.title)) {
        console.error(`Golding ${block.blockCode} title starts with term: "${block.title}".`);
        process.exitCode = 1;
    }
    if (/\b(?:TECH416|SCI442|ZHOM11|RIS102|MISC69|TECH419)\b/.test(block.title)) {
        console.error(`Golding ${block.blockCode} title contains course code: "${block.title}".`);
        process.exitCode = 1;
    }
    if (/\b(?:H402|12-6)\s+\d+(?:\/\d+)?$/.test(block.title)) {
        console.error(`Golding ${block.blockCode} title ends with room/enrollment metadata: "${block.title}".`);
        process.exitCode = 1;
    }
});

if (process.exitCode) {
    console.error('Parsed result:', JSON.stringify(parsed, null, 2));
    console.error('Golding parsed result:', JSON.stringify(goldingParsed, null, 2));
} else {
    console.log(`Confirmed ${EXPECTED_TEACHING_BLOCKS.length} teaching blocks.`);
    console.log(`Confirmed D2 is planning/non-teaching with ${parsed.ignoredPlanningBlocks} ignored planning block.`);
    console.log('Confirmed Golding admin-table rows parse clean titles, rooms, sections, categories, and expanded codes.');
}
