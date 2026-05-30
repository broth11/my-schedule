const fs = require('fs');
const path = require('path');
const parser = require('../src/schedule/teacherScheduleParser');
const { extractTextFromPdfFile } = require('./test-utils/pdfText');
const { EXPECTED_TEACHING_BLOCKS } = require('./test-utils/scheduleExpectations');
const {
    checkExpectedTeachingBlocks,
    checkPlanningBlock,
    listOrNone
} = require('./test-utils/assertScheduleParse');

const pdfPath = path.join(__dirname, '..', 'samples', 'schedule-ben.pdf');
const tmpDir = path.join(__dirname, '..', 'tmp');
const extractedTextPath = path.join(tmpDir, 'schedule-ben.extracted.txt');

async function main() {
    let rawText = '';
    let parsed = null;
    let extractionError = null;
    let parseError = null;

    try {
        rawText = await extractTextFromPdfFile(pdfPath);
    } catch (error) {
        extractionError = error;
    }

    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(extractedTextPath, rawText, 'utf8');

    if (!extractionError) {
        try {
            parsed = parser.parseTeacherScheduleText(rawText);
        } catch (error) {
            parseError = error;
        }
    }

    const {
        missingExpectedBlocks,
        unexpectedTeachingBlocks
    } = checkExpectedTeachingBlocks(parsed, EXPECTED_TEACHING_BLOCKS);
    const planningCheck = checkPlanningBlock(parsed, 'D2');
    const ignoredPlanningBlocks = parsed?.ignoredPlanningBlocks || 0;

    console.log(`PDF text extracted: ${rawText.trim() ? 'yes' : 'no'}`);
    console.log(`Expression count: ${parsed?.expressionCount ?? 0}`);
    console.log(`Teaching blocks detected: ${parsed?.selectedCodes.length ?? 0}`);
    console.log(`Ignored planning blocks: ${ignoredPlanningBlocks}`);
    console.log(`Missing expected blocks: ${listOrNone(missingExpectedBlocks)}`);
    console.log(`Unexpected teaching blocks: ${listOrNone(unexpectedTeachingBlocks)}`);
    console.log(`Extracted text written to: ${path.relative(path.join(__dirname, '..'), extractedTextPath)}`);

    if (extractionError) {
        console.error(`PDF text extraction failed: ${extractionError.message}`);
        process.exitCode = 1;
    }

    if (parseError) {
        console.error(`Expression matching or parsing failed: ${parseError.message}`);
        process.exitCode = 1;
    }

    if (rawText && !/A-\s*D/.test(parser.normalizeTeacherScheduleText(rawText))) {
        console.error('Dash normalization check failed: normalized extracted text did not include an A-D range.');
        process.exitCode = 1;
    }

    if (missingExpectedBlocks.length > 0) {
        console.error('Expected block expansion failed.');
        process.exitCode = 1;
    }

    if (planningCheck.isTeaching) {
        console.error('Planning-block detection failed: D2 was counted as teaching.');
        process.exitCode = 1;
    }

    if (ignoredPlanningBlocks < 1) {
        console.error('Planning-block detection failed: Common Planning Time was not counted as ignored/planning.');
        process.exitCode = 1;
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
