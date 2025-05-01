// middlewar/uploadMiddleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadPath = path.join(__dirname, '../utils/uploads');
if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
}

// Storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
        cb(null, uniqueName);
    }
});

// File filter (optional: for filtering by type)
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

// Upload middleware
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

module.exports = upload;
