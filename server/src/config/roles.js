// Who's who.
//
// On the user:   PLATFORM_ADMIN (runs the whole platform) or USER (everyone else).
// Per college:   College Head  (college_admins table).
// Per club:      MANAGER, TREASURER, VOLUNTEER, MEMBER (club_members table).
// The same person can be a Club Manager in one club and a plain member of another.
const PLATFORM_ROLES = ['PLATFORM_ADMIN', 'USER'];
const CLUB_ROLES = ['MANAGER', 'TREASURER', 'VOLUNTEER', 'MEMBER'];

// What each club role may do inside its club
const CLUB_CAN = {
  manage: ['MANAGER'], // club profile, members, events, shop, announcements, fundraisers, refunds
  money: ['MANAGER', 'TREASURER'], // finance, ledger, expense claims, reports
  staff: ['MANAGER', 'TREASURER', 'VOLUNTEER'], // tasks, submit claims, staff announcements, verify members
};

module.exports = { PLATFORM_ROLES, CLUB_ROLES, CLUB_CAN };
