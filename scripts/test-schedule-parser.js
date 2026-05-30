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

if (process.exitCode) {
    console.error('Parsed result:', JSON.stringify(parsed, null, 2));
} else {
    console.log(`Confirmed ${EXPECTED_TEACHING_BLOCKS.length} teaching blocks.`);
    console.log(`Confirmed D2 is planning/non-teaching with ${parsed.ignoredPlanningBlocks} ignored planning block.`);
}
