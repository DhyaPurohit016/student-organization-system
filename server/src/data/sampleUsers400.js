// 400 more fictional, development-only users. Their names, emails and student IDs never overlap with
// the 500 in sampleUsers.js, and they cover every kind of person the platform handles: College Heads,
// club managers, treasurers, volunteers, members, join requests, students waiting for approval,
// students of another college and guests.
const { clubs: catalog } = require('./sampleCatalog');

const firstNames = [
  'Advait', 'Bhavya', 'Chirag', 'Devika', 'Eshan', 'Farah', 'Gaurav', 'Harini', 'Ira', 'Jay',
  'Kiara', 'Lakshya', 'Meher', 'Nikhil', 'Ojas', 'Pooja', 'Rhea', 'Siddharth', 'Tanvi', 'Uday',
  'Vanya', 'Varun', 'Yamini', 'Zara', 'Riya',
];

const lastNames = [
  'Agarwal', 'Banerjee', 'Chopra', 'Dutta', 'Fernandes', 'Ghosh', 'Hegde', 'Jain', 'Kamath', 'Lal',
  'Mukherjee', 'Naidu', 'Oberoi', 'Pandey', 'Qureshi', 'Sethi', 'Tiwari', 'Varma', 'Wadia', 'Yadav',
];

const college = { code: 'SAMPLE400', name: 'Sample 400 College', city: 'Vadodara', approveStudents: true };
const otherCollege = { code: 'SAMPLE400P', name: 'Sample 400 Polytechnic', city: 'Surat', approveStudents: false };

// Clubs of Sample 400 College (names and descriptions from the shared catalog)
const clubCodes = ['PHOTO', 'DEBAT', 'MUSIC', 'ENTR', 'AI', 'SPRT'];
const clubs = clubCodes.map((code) => {
  const c = catalog.find((x) => x.code === code);
  return { code, name: c.name, description: c.description };
});

const JOIN_MESSAGES = [
  'I would love to help with your next event.',
  'Joined as a first-year, keen to learn.',
  'A friend recommended the club.',
  'I have some experience and want to contribute.',
  '',
];

//   where: SAMPLE400 college, SAMPLE400P (another college) or no college (guest)
//   collegeStatus: VERIFIED or PENDING (waiting for the College Head)
//   clubRole / clubStatus: their place in one club, if any
const groups = [
  { category: 'COLLEGE_HEAD', count: 2, where: 'SAMPLE400', collegeStatus: 'VERIFIED', head: true },
  { category: 'CLUB_MANAGER', count: 12, where: 'SAMPLE400', collegeStatus: 'VERIFIED', clubRole: 'MANAGER' },
  { category: 'TREASURER', count: 6, where: 'SAMPLE400', collegeStatus: 'VERIFIED', clubRole: 'TREASURER' },
  { category: 'VOLUNTEER', count: 48, where: 'SAMPLE400', collegeStatus: 'VERIFIED', clubRole: 'VOLUNTEER' },
  { category: 'CLUB_MEMBER', count: 132, where: 'SAMPLE400', collegeStatus: 'VERIFIED', clubRole: 'MEMBER' },
  { category: 'JOIN_REQUEST', count: 30, where: 'SAMPLE400', collegeStatus: 'VERIFIED', clubRole: 'MEMBER', clubStatus: 'PENDING' },
  { category: 'STUDENT_NO_CLUB', count: 20, where: 'SAMPLE400', collegeStatus: 'VERIFIED' },
  { category: 'PENDING_STUDENT', count: 30, where: 'SAMPLE400', collegeStatus: 'PENDING' },
  { category: 'OTHER_COLLEGE', count: 50, where: 'SAMPLE400P', collegeStatus: 'VERIFIED' },
  { category: 'GUEST', count: 70, where: null, collegeStatus: 'NONE' },
];

const total = groups.reduce((sum, g) => sum + g.count, 0);
if (total !== 400) throw new Error(`Expected 400 sample users, got ${total}`);
if (firstNames.length * lastNames.length < total) throw new Error('Name lists are too short for unique names');

const users = [];
let number = 0;
for (const group of groups) {
  for (let i = 0; i < group.count; i += 1) {
    // Every first name with every surname: 25 × 20 = 500 unique combinations
    const name = `${firstNames[number % firstNames.length]} ${lastNames[Math.floor(number / firstNames.length)]}`;
    number += 1;
    const n = String(number).padStart(3, '0');
    users.push({
      number,
      name,
      email: `user${n}@sample400.demo.test`,
      studentId: group.where ? `${group.where === 'SAMPLE400' ? 'S400' : 'P400'}-${String(number).padStart(4, '0')}` : null,
      phone: `97${String(number).padStart(8, '0')}`,
      emailOptIn: number % 5 !== 0,
      category: group.category,
      where: group.where,
      collegeStatus: group.collegeStatus,
      head: Boolean(group.head),
      clubRole: group.clubRole || null,
      clubStatus: group.clubRole ? group.clubStatus || 'ACTIVE' : null,
      // Spread each group evenly over the clubs (managers: 2 per club, treasurers: 1 per club...)
      clubCode: group.clubRole ? clubs[i % clubs.length].code : null,
      message: group.clubStatus === 'PENDING' ? JOIN_MESSAGES[i % JOIN_MESSAGES.length] || null : null,
    });
  }
}

// Names must be unique across this file too
if (new Set(users.map((u) => u.name)).size !== users.length) throw new Error('Duplicate sample names');

module.exports = {
  college,
  otherCollege,
  clubs,
  users,
  counts: Object.fromEntries(groups.map(({ category, count }) => [category, count])),
};
