// Route guards for club- and college-scoped URLs.
//   /api/clubs/:clubId/manage/...       → clubGuard('manage' | 'money' | 'staff' | 'view' | 'oversee' | 'finance')
//   /api/colleges/:collegeId/manage/... → collegeGuard()
//   /api/platform/...                   → platformGuard
const { College } = require('../models');
const access = require('../services/access');
const AppError = require('../utils/AppError');

const MESSAGES = {
  manage: 'Only the club manager can do this',
  money: "Only the club's manager or treasurer can do this",
  staff: 'Only club volunteers can do this',
  view: 'Only club staff and the College Head can see this',
  oversee: 'Only the club manager and the College Head can see this',
  finance: "Only the club's manager, treasurer or the College Head can do this",
};

// Loads the club, works out the user's standing in it, and checks the capability
function clubGuard(capability) {
  return async (req, res, next) => {
    try {
      const club = await access.loadClub(req.params.clubId);
      if (!club) throw new AppError('Club not found', 404);
      const a = await access.clubAccess(req.user, club);
      if (club.status === 'ARCHIVED' && !a.overseer) throw new AppError('This club has been archived', 410);
      if (capability && !a.can[capability]) throw new AppError(MESSAGES[capability], 403);
      req.club = club;
      req.access = a;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// College Heads of this college (the Platform Admin manages colleges from the platform pages instead)
async function collegeGuard(req, res, next) {
  try {
    const college = await College.findByPk(req.params.collegeId);
    if (!college) throw new AppError('College not found', 404);
    if (!(await access.isCollegeHead(req.user, college.id))) throw new AppError('Only the College Head can do this', 403);
    req.college = college;
    next();
  } catch (err) {
    next(err);
  }
}

function platformGuard(req, res, next) {
  if (!access.isPlatformAdmin(req.user)) return next(new AppError('Only the platform admin can do this', 403));
  next();
}

module.exports = { clubGuard, collegeGuard, platformGuard };
