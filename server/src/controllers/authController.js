const { User, College, CollegeAdmin } = require('../models');
const AppError = require('../utils/AppError');
const { signToken } = require('../utils/token');
const { notify } = require('../services/notificationService');

function sendAuth(res, user, status = 200) {
  res.status(status).json({ token: signToken(user), user });
}

// Works out the college fields for a chosen college: trusted straight away, or waiting for
// a College Head when the college asks to approve students. No college → guest.
async function collegeFields(collegeId) {
  if (collegeId === undefined) return {};
  if (!collegeId) return { collegeId: null, collegeStatus: 'NONE' };
  const college = await College.findByPk(collegeId);
  if (!college || college.status !== 'ACTIVE') throw new AppError('Please choose a college from the list');
  return { collegeId: college.id, collegeStatus: college.approveStudents ? 'PENDING' : 'VERIFIED', college };
}

async function notifyHeads(college, user) {
  if (!college?.approveStudents) return;
  const heads = await CollegeAdmin.findAll({ where: { collegeId: college.id }, attributes: ['userId'] });
  await notify(heads.map((h) => h.userId), { title: 'New student to approve', body: `${user.name} (${user.email}) says they study at ${college.name}.`, link: `/college/${college.id}/students?status=PENDING` });
}

// POST /api/auth/register — anyone can sign up with any email. Optionally choose a college.
async function register(req, res) {
  const { name, email, password, phone, studentId, collegeId } = req.body;
  if (!name || !email || !password) throw new AppError('Name, email and password are required');

  const { college, ...fields } = await collegeFields(collegeId || null);
  // role is never read from the body: nobody can sign up as a platform admin
  const user = await User.create({ name, email, password, phone, studentId, role: 'USER', ...fields });
  await notifyHeads(college, user);
  sendAuth(res, user, 201);
}

// POST /api/auth/login
async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) throw new AppError('Email and password are required');

  const user = await User.scope('withPassword').findOne({ where: { email: String(email).trim().toLowerCase() } });
  if (!user || !(await user.comparePassword(String(password)))) throw new AppError('Invalid email or password', 401);
  if (!user.isActive) throw new AppError('This account has been disabled', 403);

  await User.update({ lastLoginAt: new Date() }, { where: { id: user.id } });
  sendAuth(res, user);
}

// GET /api/auth/me
async function me(req, res) {
  res.json({ user: req.user });
}

// PATCH /api/auth/password { currentPassword, newPassword }
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) throw new AppError('Current and new password are required');
  const user = await User.scope('withPassword').findByPk(req.user.id);
  if (!(await user.comparePassword(String(currentPassword)))) throw new AppError('Current password is incorrect', 401);
  user.password = newPassword;
  await user.save();
  sendAuth(res, user);
}

// PATCH /api/auth/profile — own details; changing college starts verification again
async function updateProfile(req, res) {
  for (const key of ['name', 'phone', 'studentId', 'emailOptIn']) {
    if (req.body[key] !== undefined) req.user[key] = req.body[key];
  }
  let college = null;
  if (req.body.collegeId !== undefined && Number(req.body.collegeId || 0) !== Number(req.user.collegeId || 0)) {
    if (req.user.role === 'PLATFORM_ADMIN') throw new AppError("A Platform Admin account doesn't belong to a college");
    if (await CollegeAdmin.count({ where: { userId: req.user.id } })) throw new AppError('College Heads stay with the college they run. Ask the Platform Admin to change it.');
    const result = await collegeFields(req.body.collegeId || null);
    college = result.college;
    req.user.collegeId = result.collegeId;
    req.user.collegeStatus = result.collegeStatus;
  }
  await req.user.save();
  await notifyHeads(college, req.user);
  res.json({ user: req.user });
}

module.exports = { register, login, me, changePassword, updateProfile };
