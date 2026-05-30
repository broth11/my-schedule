#!/usr/bin/env node
const fs = require('fs');
const { parseAndValidateSchoolYearJson } = require('../src/calendar/schoolYearValidator');

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const filePath = args.find(arg => arg !== '--strict');

if (!filePath) {
    console.error('Usage: node scripts/validate-school-year-json.js <file.json> [--strict]');
    process.exit(1);
}

const result = parseAndValidateSchoolYearJson(fs.readFileSync(filePath, 'utf8'));

console.log(`File: ${filePath}`);
console.log(`Months: ${result.months}`);
console.log(`Days: ${result.days}`);
console.log(`Errors: ${result.errors.length}`);
console.log(`Warnings: ${result.warnings.length}`);

result.errors.forEach(error => console.error(`ERROR: ${error}`));
result.warnings.forEach(warning => console.warn(`WARNING: ${warning}`));

if (result.errors.length || (strict && result.warnings.length)) {
    process.exit(1);
}
