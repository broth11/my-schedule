// Regression test for getBlockDisplayInfo logic.
// Verifies that assignment titles are returned as primary text and that
// "Teaching" never appears as the title when a real assignment exists.

'use strict';

// ── Minimal stubs matching the browser globals used by the helper ────────────

const selectedClasses    = new Set(['D4', 'D5', 'D1', 'D-FX', 'D-ELB']);
const scheduleAssignments = {
  'D4':    'IB Math AI HL Y2',
  'D5':    'Accelerated Math 9',
  'D1':    'Data Science',
  'D-FX':  'Advisory 10',
  'D-ELB': 'Extended Learning Block',
};
const scheduleCategories = {
  'D4':    'teaching',
  'D5':    'teaching',
  'D1':    'teaching',
  'D-FX':  'advisory',
  'D-ELB': 'elb',
};
const scheduleRooms = {
  'D4':    'H406',
  'D5':    'H406',
  'D1':    'H406',
  'D-FX':  'H406',
  'D-ELB': 'H406',
};
const MANUAL_BUSY_TITLE = 'Busy';

// ── Inline implementation matching src/main.js getBlockDisplayInfo ───────────

function getBlockDisplayInfo(code) {
  const slotLabel  = code.includes('-') ? code.split('-')[1] : code.slice(1);
  const isAssigned = selectedClasses.has(code);
  const rawTitle   = scheduleAssignments[code] || '';
  const title      = isAssigned ? (rawTitle || MANUAL_BUSY_TITLE) : '';
  const category   = isAssigned ? (scheduleCategories[code] || 'teaching') : null;
  const categoryLabel = category ? ({
    teaching: 'Teaching', homeroom: 'Homeroom', advisory: 'Advisory',
    elb: 'ELB', planning: 'Planning', other: 'Other',
  }[category] || category) : '';
  const room = scheduleRooms[code] || '';
  const blockLabel = slotLabel === 'FX' ? 'Flex' : slotLabel === 'ELB' ? 'ELB' : code;
  return { code, slotLabel, blockLabel, isAssigned, title, category, categoryLabel, room };
}

// ── Test runner ──────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      expected: ${JSON.stringify(expected)}`);
    console.error(`      actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

console.log('\ngetBlockDisplayInfo — regression tests\n');

const cases = [
  { code: 'D4',    title: 'IB Math AI HL Y2',       slotLabel: '4',   blockLabel: 'D4',   catLabel: 'Teaching', room: 'H406' },
  { code: 'D5',    title: 'Accelerated Math 9',      slotLabel: '5',   blockLabel: 'D5',   catLabel: 'Teaching', room: 'H406' },
  { code: 'D1',    title: 'Data Science',             slotLabel: '1',   blockLabel: 'D1',   catLabel: 'Teaching', room: 'H406' },
  { code: 'D-FX',  title: 'Advisory 10',              slotLabel: 'FX',  blockLabel: 'Flex', catLabel: 'Advisory', room: 'H406' },
  { code: 'D-ELB', title: 'Extended Learning Block',  slotLabel: 'ELB', blockLabel: 'ELB',  catLabel: 'ELB',      room: 'H406' },
];

cases.forEach(({ code, title, slotLabel, blockLabel, catLabel, room }) => {
  const info = getBlockDisplayInfo(code);
  console.log(`\n  ${code}:`);
  check(`title = "${title}"`,               info.title,         title);
  check(`slotLabel = "${slotLabel}"`,       info.slotLabel,     slotLabel);
  check(`blockLabel = "${blockLabel}"`,     info.blockLabel,    blockLabel);
  check(`isAssigned = true`,                info.isAssigned,    true);
  check(`categoryLabel = "${catLabel}"`,    info.categoryLabel, catLabel);
  check(`room = "${room}"`,                 info.room,          room);
  check(`title is not "Teaching"`,          info.title !== 'Teaching', true);
  check(`title is not ""`,                  info.title !== '',  true);
});

// Unassigned block must return empty title
const unassigned = getBlockDisplayInfo('D2');
console.log('\n  D2 (unassigned):');
check('title = ""',      unassigned.title,      '');
check('isAssigned = false', unassigned.isAssigned, false);
check('categoryLabel = ""', unassigned.categoryLabel, '');

// Assigned block with no imported title must return "Busy", not "Teaching"
const noTitle = new Set(['D3']);
const origSelected = selectedClasses.has('D3');
selectedClasses.add('D3');
delete scheduleAssignments['D3'];
const withoutTitle = getBlockDisplayInfo('D3');
console.log('\n  D3 (assigned, no imported title):');
check('title = "Busy"',                withoutTitle.title, 'Busy');
check('title is not "Teaching"',       withoutTitle.title !== 'Teaching', true);
if (!origSelected) selectedClasses.delete('D3');

// Summary
console.log(`\n${'─'.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
