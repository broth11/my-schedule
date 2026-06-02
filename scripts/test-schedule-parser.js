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
if (goldingParsed.teacherName !== 'Robert Michael Golding') {
    console.error(`Expected Golding teacher name to parse as "Robert Michael Golding", got "${goldingParsed.teacherName}".`);
    process.exitCode = 1;
}

const expandedFixtureText = `
Teacher Schedule - Middle School Example
Expression Term Course # Course Sec # Room Enrollment
MS-Ruamrudee International School
SB(A,C) S2 ELCP7 Computer Science 7 1 M106 16
AS(A-D) 25-26 PER139 Jazz Band (Year) 1 L301 25 HS-Ruamrudee International School
FX3(B,D) 25-26 MSHH104 Tigers House Home 4 M409 41
1(A,C) 25-26 ELBN8N Band 8 1 L301 17
1(A,C) 25-26 ELBCE8 Grade 8 Music Ensemble 1 L301 8
4(A) 25-26 GRADE7 Grade 7 Team Meeting 2 0
4(A) 25-26 MSSCMEET Science PLT 1 0
2(B,D) 25-26 PE008 Physical Education 8 1 GH 20
3(D) SB(A,C) 25-26 SCI06 General Science 6 3 M102 19
ADV(A-D) 25-26 ADV08 Advisory 8 1 M408 20
FXB(B) 25-26 MISC77 Flex Block Support 1 M410 10
`;
const expandedParsed = parser.parseTeacherScheduleText(expandedFixtureText);

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

function findExpandedBlocks(code, title) {
    return (expandedParsed.blocks || []).filter(block => block.blockCode === code && (!title || block.title === title));
}

function assertExpandedBlock(code, expected) {
    const block = findExpandedBlocks(code, expected.title)[0];
    if (!block) {
        console.error(`Expanded fixture missing ${code} "${expected.title}".`);
        process.exitCode = 1;
        return;
    }

    Object.entries(expected).forEach(([field, expectedValue]) => {
        if (field === 'title') return;
        const actualValue = Array.isArray(expectedValue) ? JSON.stringify(block[field] || []) : (block[field] || null);
        const normalizedExpected = Array.isArray(expectedValue) ? JSON.stringify(expectedValue) : expectedValue;
        if (actualValue !== normalizedExpected) {
            console.error(`Expanded ${code} ${field}: expected "${normalizedExpected}", got "${actualValue}".`);
            process.exitCode = 1;
        }
    });
}

if (expandedParsed.primaryScheduleBlockModel !== 'ms-static-block') {
    console.error(`Expected MS block model, got ${expandedParsed.primaryScheduleBlockModel}.`);
    process.exitCode = 1;
}

const mixedSchoolWithSb = parser.parseTeacherScheduleText(`
Teacher Schedule - Mixed School Example
Expression Term Course # Course Sec # Room Enrollment
HS-Ruamrudee International School
SB(A,C) S2 ELCP7 Computer Science 7 1 M106 16 MS-Ruamrudee International School
`);
if (mixedSchoolWithSb.primaryScheduleBlockModel !== 'ms-static-block') {
    console.error(`Expected mixed-school SB schedule to use MS block model, got ${mixedSchoolWithSb.primaryScheduleBlockModel}.`);
    process.exitCode = 1;
}

const msFxAndSb = parser.parseTeacherScheduleText(`
Teacher Schedule - MS FX SB Example
Expression Term Course # Course Sec # Room Enrollment
MS-Ruamrudee International School
FX(A) S2 HELP7 Math Help 1 M101 10 MS-Ruamrudee International School
SB(A) S2 HELP7 Math Help 1 M101 10 MS-Ruamrudee International School
`);
const msFxSbBlocks = (msFxAndSb.blocks || []).filter(block => block.blockCode === 'A-FXSB');
if (msFxAndSb.primaryScheduleBlockModel !== 'ms-static-block') {
    console.error(`Expected FX/SB sample to use MS block model, got ${msFxAndSb.primaryScheduleBlockModel}.`);
    process.exitCode = 1;
}
if (msFxSbBlocks.length !== 1) {
    console.error(`Expected FX(A) and SB(A) to dedupe to one A-FXSB block, got ${msFxSbBlocks.length}.`);
    process.exitCode = 1;
}

assertExpandedBlock('A-FXSB', { title: 'Computer Science 7', room: 'M106', category: 'teaching' });
assertExpandedBlock('C-FXSB', { title: 'Computer Science 7', room: 'M106', category: 'teaching' });
assertExpandedBlock('A-AS', { title: 'Jazz Band (Year)', room: 'L301', category: 'after-school' });
assertExpandedBlock('D-AS', { title: 'Jazz Band (Year)', room: 'L301', category: 'after-school' });
assertExpandedBlock('B-FXSB', { title: 'Tigers House Home', room: 'M409', category: 'homeroom', cycleDayConstraints: ['B3'] });
assertExpandedBlock('D-FXSB', { title: 'Tigers House Home', room: 'M409', category: 'homeroom', cycleDayConstraints: ['D3'] });
assertExpandedBlock('A4', { title: 'Grade 7 Team Meeting', room: null, category: 'meeting' });
assertExpandedBlock('A4', { title: 'Science PLT', room: null, category: 'meeting' });
assertExpandedBlock('B2', { title: 'Physical Education 8', room: 'GH', category: 'teaching' });
assertExpandedBlock('D3', { title: 'General Science 6', room: 'M102', category: 'teaching' });
assertExpandedBlock('A-FXSB', { title: 'General Science 6', room: 'M102', category: 'teaching' });
assertExpandedBlock('A-ADV', { title: 'Advisory 8', room: 'M408', category: 'advisory' });
assertExpandedBlock('B-FXB', { title: 'Flex Block Support', room: 'M410', category: 'teaching' });

if (findExpandedBlocks('A1').length !== 2 || findExpandedBlocks('C1').length !== 2) {
    console.error('Expected duplicate A1/C1 assignments to be preserved.');
    process.exitCode = 1;
}

(expandedParsed.blocks || []).forEach(block => {
    if (/\b(?:M106|M102|M408|M409|M410|L301|GH)\s+\d+\b/.test(block.title)) {
        console.error(`Expanded ${block.blockCode} title is polluted: "${block.title}".`);
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
    console.log('Confirmed SB, AS, FX-number constraints, ADV/FXB, duplicate assignments, meetings, and room cleanup.');
}
