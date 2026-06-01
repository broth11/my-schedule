const model = require('../src/schedule/blockModel');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function summarize(entries) {
    return entries.map(entry => `${entry.periodLabel}:${entry.blockCode}`).join('|');
}

function main() {
    const hsA5 = model.getScheduleEntriesForCycle('A5', 'hs-flex-elb', false, 'expanded');
    assert(
        summarize(hsA5) === '1st:A5|2nd:A1|3rd:A2|4th:A3|Flex:A-FX|ELB:A-ELB|5th:A4',
        `HS A5 order/labels mismatch: ${summarize(hsA5)}`
    );

    const msA5 = model.getScheduleEntriesForCycle('A5', 'ms-static-block', false, 'expanded');
    assert(
        summarize(msA5) === '1st:A5|2nd:A1|3rd:A2|4th:A3|Static Block:A-SB|5th:A4',
        `MS A5 order/labels mismatch: ${summarize(msA5)}`
    );

    const msA5WithAs = model.getScheduleEntriesForCycle('A5', 'ms-static-block', true, 'expanded');
    assert(
        summarize(msA5WithAs) === '1st:A5|2nd:A1|3rd:A2|4th:A3|Static Block:A-SB|5th:A4|After School:A-AS',
        `MS A5 AS order/labels mismatch: ${summarize(msA5WithAs)}`
    );

    const compact = model.getScheduleEntriesForCycle('A5', 'ms-static-block', true, 'compact');
    assert(
        summarize(compact) === '1st:A5|2nd:A1|3rd:A2|4th:A3|SB:A-SB|5th:A4|AS:A-AS',
        `Compact labels mismatch: ${summarize(compact)}`
    );

    console.log('Block model structure tests passed');
}

main();
