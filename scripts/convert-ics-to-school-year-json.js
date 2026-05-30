#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { convertIcsToSchoolYearJson } = require('../src/calendar/icsToSchoolYearJson');
const { validateSchoolYearData } = require('../src/calendar/schoolYearValidator');

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
    console.error('Usage: node scripts/convert-ics-to-school-year-json.js <input.ics> <output.json>');
    process.exit(1);
}

const output = convertIcsToSchoolYearJson(fs.readFileSync(inputPath, 'utf8'));
const validation = validateSchoolYearData(output);

if (validation.errors.length) {
    console.error(`Conversion produced invalid school-year data: ${validation.errors.join('; ')}`);
    process.exit(1);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(`Converted ${inputPath} -> ${outputPath}`);
console.log(`Months: ${validation.months}`);
console.log(`Days: ${validation.days}`);
console.log(`Warnings: ${validation.warnings.length}`);
