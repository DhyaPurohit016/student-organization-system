// Helpers over the "my context" data (GET /api/me/context)
export const ROLE_LABEL = { MANAGER: 'Manager', TREASURER: 'Treasurer', VOLUNTEER: 'Volunteer', MEMBER: 'Member' };
export const CLUB_ROLE_OPTIONS = ['MEMBER', 'VOLUNTEER', 'TREASURER', 'MANAGER'].map((value) => ({ value, label: ROLE_LABEL[value] }));

export const isPlatformAdmin = (ctx) => Boolean(ctx?.isPlatformAdmin);
export const activeClubs = (ctx) => (ctx?.clubs || []).filter((c) => c.status === 'ACTIVE');
export const staffClubs = (ctx) => activeClubs(ctx).filter((c) => c.can.staff);
// Volunteer tools (My Events, My Tasks, Helping Out...) are for club staff only, not College Heads or the Platform Admin
export const isStaffAnywhere = (ctx) => staffClubs(ctx).length > 0;

export const COLLEGE_STATUS = {
  NONE: { label: 'Guest (no college)', tone: 'neutral' },
  PENDING: { label: 'Waiting for college approval', tone: 'warn' },
  VERIFIED: { label: 'Verified student', tone: 'good' },
  REJECTED: { label: 'College could not verify you', tone: 'bad' },
};

export const VISIBILITY = {
  PUBLIC: { label: 'Public', help: 'Anyone can register, including students of other colleges and guests.' },
  COLLEGE: { label: 'College only', help: 'Only verified students of this college (and club members) can register.' },
  CLUB: { label: 'Club members only', help: 'Only members of this club can register.' },
};

export const REG_TYPE = {
  CLUB_MEMBER: 'Club member',
  COLLEGE_STUDENT: 'Same college',
  EXTERNAL_STUDENT: 'Other college',
  GUEST: 'Guest',
};

export const isCollegeHead = (ctx) => (ctx?.headOf || []).length > 0;
export const isVerifiedStudent = (ctx) => Boolean(ctx?.college && ctx.collegeStatus === 'VERIFIED');

// Simple words for statuses people see every day
export const TASK_STATUS = {
  TODO: { label: 'Pending', tone: 'warn' },
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  DONE: { label: 'Completed', tone: 'good' },
};
export const EXPENSE_STATUS = {
  SUBMITTED: { label: 'Pending', tone: 'warn' },
  APPROVED: { label: 'Approved', tone: 'info' },
  REJECTED: { label: 'Rejected', tone: 'bad' },
  PAID: { label: 'Paid', tone: 'good' },
};
