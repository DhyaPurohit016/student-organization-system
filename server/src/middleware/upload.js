const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const AppError = require('../utils/AppError');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Images and PDFs only (product photos, receipts)
const TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'application/pdf': '.pdf' };

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    // Random names: files can't be guessed or overwrite each other
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + TYPES[file.mimetype]),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => (TYPES[file.mimetype] ? cb(null, true) : cb(new AppError('Only JPG, PNG, WEBP, GIF or PDF files are allowed'))),
});

// Single "file" field; turns multer errors into friendly 400s
function singleFile(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return next(new AppError('File is too large (max 5 MB)'));
    if (err) return next(err instanceof AppError ? err : new AppError(err.message));
    if (!req.file) return next(new AppError('No file uploaded'));
    next();
  });
}

module.exports = { UPLOAD_DIR, singleFile };
