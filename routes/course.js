// const express = require('express');
// const multer = require('multer');
// const path = require('path');
// const fs = require('fs');
// const Course = require('../models/Course');

// const router = express.Router();

// const uploadPath = path.join(__dirname, '..', 'uploads');
// if (!fs.existsSync(uploadPath)) {
//   fs.mkdirSync(uploadPath, { recursive: true });
// }

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, uploadPath);
//   },
//   filename: (req, file, cb) => {
//     const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
//     cb(null, uniqueSuffix + path.extname(file.originalname));
//   },
// });

// const upload = multer({
//   storage,
//   limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
//   fileFilter: (req, file, cb) => {
//     const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
//     if (allowedTypes.includes(file.mimetype)) {
//       cb(null, true);
//     } else {
//       cb(new Error('Only video files (.mp4, .mov, .avi, .webm) are allowed!'));
//     }
//   }
// });

// // @route   GET /course
// // @desc    Get all courses
// router.get('/', async (req, res) => {
//   try {
//     const courses = await Course.find();
//     res.status(200).json(courses);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: 'Server error', error: err.message });
//   }
// });

// // @route   GET /course/:id
// // @desc    Get a single course by ID
// router.get('/:id', async (req, res) => {
//   try {
//     const course = await Course.findById(req.params.id);
//     if (!course) {
//       return res.status(404).json({ message: 'Course not found' });
//     }
//     res.status(200).json(course);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: 'Server error', error: err.message });
//   }
// });

// // @route   POST /course/upload
// // @desc    Create a new course with video upload
// router.post('/upload', upload.array('videos'), async (req, res) => {
//   try {
//     const { courseTitle, courseDescription, videoTitles, videoDescriptions, durations } = req.body;

//     // Parse JSON strings from form data
//     const titleArray = JSON.parse(videoTitles || '[]');
//     const descriptionArray = JSON.parse(videoDescriptions || '[]');
//     const durationArray = JSON.parse(durations || '[]').map(duration => Number(duration));

//     const videoFiles = req.files;

//     if (!videoFiles || videoFiles.length === 0) {
//       return res.status(400).json({ message: 'No video files uploaded.' });
//     }

//     // Calculate total minutes from all videos
//     const totalMinutes = durationArray.reduce((sum, duration) => sum + duration, 0);

//     // Create videos array according to VideoSchema
//     const videos = videoFiles.map((file, index) => ({
//       title: titleArray[index] || '',
//       description: descriptionArray[index] || '',
//       url: `/uploads/${file.filename}`, // Store the file path instead of filename
//       duration: durationArray[index] || 0,
//     }));

//     // Create new course with the correct field names
//     const newCourse = new Course({
//       title: courseTitle,
//       description: courseDescription,
//       videos,
//       totalMinutes,
//     });

//     await newCourse.save();

//     res.status(201).json({ message: 'Course uploaded successfully', course: newCourse });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: 'Server error', error: err.message });
//   }
// });

// module.exports = router;
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Course = require('../models/Course');

const router = express.Router();

const uploadPath = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only video files (.mp4, .mov, .avi, .webm) are allowed!'));
    }
  }
});

// @route   GET /course
router.get('/', async (req, res) => {
  try {
    const courses = await Course.find();
    res.status(200).json(courses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route   GET /course/details/by-title/:title
router.get('/details/by-title/:title', async (req, res) => {
  try {
    // Decode the title and make the query case-insensitive
    const title = decodeURIComponent(req.params.title);
    const course = await Course.findOne({ title: new RegExp(title, 'i') }); // Case-insensitive search

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.json(course);
  } catch (err) {
    console.error('Failed to fetch course by title:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /course/upload
router.post('/upload', upload.array('videos'), async (req, res) => {
  try {
    const { courseTitle, courseDescription, videoTitles, videoDescriptions, durations } = req.body;

    const titleArray = JSON.parse(videoTitles || '[]');
    const descriptionArray = JSON.parse(videoDescriptions || '[]');
    const durationArray = JSON.parse(durations || '[]').map(duration => Number(duration));
    const videoFiles = req.files;

    if (!videoFiles || videoFiles.length === 0) {
      return res.status(400).json({ message: 'No video files uploaded.' });
    }

    const totalMinutes = durationArray.reduce((sum, duration) => sum + duration, 0);

    const videos = videoFiles.map((file, index) => ({
      title: titleArray[index] || '',
      description: descriptionArray[index] || '',
      url: `/uploads/${file.filename}`,
      duration: durationArray[index] || 0,
    }));

    const newCourse = new Course({
      title: courseTitle,
      description: courseDescription,
      videos,
      totalMinutes,
    });

    await newCourse.save();

    res.status(201).json({ message: 'Course uploaded successfully', course: newCourse });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
