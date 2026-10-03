const { clubs } = require('./sampleCatalog');

const firstNames = [
  'Aarav', 'Aanya', 'Aditya', 'Aisha', 'Anaya', 'Arjun', 'Diya', 'Ishaan', 'Kavya', 'Krish',
  'Mira', 'Neel', 'Nisha', 'Rohan', 'Saanvi', 'Samar', 'Tara', 'Vihaan', 'Yash', 'Zoya',
];

const lastNames = [
  'Desai', 'Patel', 'Shah', 'Mehta', 'Joshi', 'Trivedi', 'Rao', 'Iyer', 'Kapoor', 'Khan',
  'Menon', 'Singh', 'Gupta', 'Nair', 'Patil', 'Chauhan', 'Kulkarni', 'Bose', 'Reddy', 'Mistry',
  'Pillai', 'Saxena', 'Malhotra', 'Dave', 'Thomas',
];

const roleGroups = [
  { category: 'MEMBER', count: 250, clubRole: 'MEMBER' },
  { category: 'VOLUNTEER', count: 100, clubRole: 'VOLUNTEER' },
  { category: 'COLLEGE_HEAD', count: 2 },
  { category: 'EVENT_MANAGER', count: 74, clubRole: 'MANAGER' },
  { category: 'FINANCE', count: 74, clubRole: 'TREASURER' },
];

const total = roleGroups.reduce((sum, group) => sum + group.count, 0);
if (firstNames.length * lastNames.length < total) {
  throw new Error('Sample name lists must generate at least one unique name per user.');
}

const users = [];
let number = 0;

for (const group of roleGroups) {
  for (let i = 0; i < group.count; i += 1) {
    const firstNameIndex = number % firstNames.length;
    const lastNameIndex = Math.floor(number / firstNames.length);
    number += 1;

    users.push({
      number,
      name: `${firstNames[firstNameIndex]} ${lastNames[lastNameIndex]}`,
      email: `person${String(number).padStart(3, '0')}@sample500.demo.test`,
      studentId: `S500-${String(number).padStart(4, '0')}`,
      category: group.category,
      clubRole: group.clubRole || null,
      clubCode: group.clubRole ? clubs[(number - 1) % clubs.length].code : null,
    });
  }
}

module.exports = {
  college: { code: 'SAMPLE500', name: 'Sample 500 College', city: 'Ahmedabad' },
  clubs,
  users,
  roleCounts: Object.fromEntries(roleGroups.map(({ category, count }) => [category, count])),
};
