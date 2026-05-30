const EXPECTED_TEACHING_BLOCKS = [
    'A-HR',
    'B-HR',
    'C-HR',
    'D-HR',
    'A2',
    'B2',
    'C2',
    'A3',
    'C3',
    'D3',
    'A4',
    'C4',
    'D4',
    'A-FX',
    'A-ELB',
    'B-ELB',
    'C-ELB',
    'D-ELB',
    'B5',
    'C5',
    'D5',
    'B1',
    'D1'
];

const EXPECTED_ASSIGNMENTS = {
    'A-HR': 'Homeroom 10',
    'B-HR': 'Homeroom 10',
    'C-HR': 'Homeroom 10',
    'D-HR': 'Homeroom 10',
    A2: 'IB Math AI HL Y1',
    B2: 'IB Math AI HL Y1',
    C2: 'IB Math AI HL Y1',
    A3: 'Accelerated Math 9',
    C3: 'Accelerated Math 9',
    D3: 'Accelerated Math 9',
    A4: 'IB Math AI HL Y2',
    C4: 'IB Math AI HL Y2',
    D4: 'IB Math AI HL Y2',
    'A-FX': 'Advisory 10',
    'A-ELB': 'Extended Learning Block',
    'B-ELB': 'Extended Learning Block',
    'C-ELB': 'Extended Learning Block',
    'D-ELB': 'Extended Learning Block',
    B5: 'Accelerated Math 9',
    C5: 'Accelerated Math 9',
    D5: 'Accelerated Math 9',
    B1: 'Data Science',
    D1: 'Data Science'
};

const EXPECTED_METADATA = Object.fromEntries(
    EXPECTED_TEACHING_BLOCKS.map(blockCode => {
        const title = EXPECTED_ASSIGNMENTS[blockCode];
        let category = 'teaching';
        if (blockCode.endsWith('-HR')) category = 'homeroom';
        if (blockCode.endsWith('-FX')) category = 'advisory';
        if (blockCode.endsWith('-ELB')) category = 'elb';

        return [
            blockCode,
            {
                title,
                room: 'H406',
                category
            }
        ];
    })
);

const EXPECTED_IGNORED_METADATA = {
    D2: {
        title: 'Common Planning Time',
        room: '',
        category: 'planning'
    }
};

module.exports = {
    EXPECTED_TEACHING_BLOCKS,
    EXPECTED_ASSIGNMENTS,
    EXPECTED_METADATA,
    EXPECTED_IGNORED_METADATA,
    EXPECTED_ROOM: 'H406'
};
