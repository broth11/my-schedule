const fs = require('fs');
const path = require('path');
const { convertIcsToSchoolYearJson } = require('../src/calendar/icsToSchoolYearJson');
const { validateSchoolYearData } = require('../src/calendar/schoolYearValidator');

const rootDir = path.join(__dirname, '..');
const inputPath = path.join(rootDir, 'samples', 'ris-cycle-days-sample.ics');
const tmpDir = path.join(rootDir, 'tmp');
const outputPath = path.join(tmpDir, 'ris-cycle-days-sample.generated.json');

fs.mkdirSync(tmpDir, { recursive: true });

const converted = convertIcsToSchoolYearJson(fs.readFileSync(inputPath, 'utf8'));
fs.writeFileSync(outputPath, `${JSON.stringify(converted, null, 2)}\n`);

const validation = validateSchoolYearData(converted);
const august = converted['2026-08'] || [];
const byDate = new Map(august.map(day => [day.date, day]));

const checks = [
    ['2026-08 exists', Boolean(converted['2026-08'])],
    ['A1 detected', byDate.get(12)?.cycle === 'A1'],
    ['B2 hyphen cycle detected', byDate.get(13)?.cycle === 'B2'],
    ['holiday detected', byDate.get(14)?.cycle === 'HOLIDAY'],
    ['in-service detected', byDate.get(17)?.cycle === 'IN-SERVICE'],
    ['PTC detected before half-day fallback', byDate.get(18)?.cycle === 'PTC'],
    ['extra note preserved', byDate.get(12)?.note === 'First day of school']
];

const failed = checks.filter(([, passed]) => !passed).map(([label]) => label);

console.log(`Converted sample ICS: ${path.relative(rootDir, inputPath)}`);
console.log(`Generated JSON: ${path.relative(rootDir, outputPath)}`);
console.log(`Months: ${validation.months}`);
console.log(`Days: ${validation.days}`);
console.log(`Errors: ${validation.errors.length}`);
console.log(`Warnings: ${validation.warnings.length}`);
console.log(`Failed checks: ${failed.length ? failed.join(', ') : 'none'}`);

validation.errors.forEach(error => console.error(`ERROR: ${error}`));
validation.warnings.forEach(warning => console.warn(`WARNING: ${warning}`));

if (validation.errors.length || failed.length) {
    process.exit(1);
}
