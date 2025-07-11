// const express = require('express');
// const router = express.Router();
// const multer = require('multer');
// const { v4: uuidv4 } = require('uuid');
// const mongoose = require('mongoose');
// const Course = require('../models/Course');
// const UserProgress = require('../models/UserProgress');
// const S3Service = require('../utils/s3');
// const authenticateJWT = require('../middleware/auth');
// const authorizeAdmin = require('../middleware/authorizeAdmin');

// // Multer setup
// const storage = multer.memoryStorage();
// const upload = multer({
//   storage,
//   limits: { fileSize: 1_000_000_000 }, // 1 GB
//   fileFilter: (req, file, cb) => {
//     const allowedTypes = ['video/mp4', 'video/webm', 'video/mkv', 'video/quicktime'];
//     if (allowedTypes.includes(file.mimetype)) cb(null, true);
//     else cb(new Error('Only video files are allowed'));
//   }
// });

// /**
//  * Upload Videos to S3
//  */
// router.post('/upload-videos', authenticateJWT, authorizeAdmin, upload.any(), async (req, res) => {
//   try {
//     const maxCount = Number(req.body?.maxCount) || 100;
//     const files = req.files;

//     if (!files || files.length === 0) {
//       return res.status(400).json({ message: 'No files uploaded' });
//     }

//     if (files.length > maxCount) {
//       return res.status(400).json({ message: `Maximum ${maxCount} files are allowed` });
//     }

//     if (!S3Service.isConfigured()) {
//       return res.status(500).json({ message: 'S3 is not configured properly' });
//     }

//     const uploadResults = [];

//     for (const file of files) {
//       const ext = file.originalname.split('.').pop();
//       const s3Key = `videos/${uuidv4()}.${ext}`;

//       const result = await S3Service.uploadFile({
//         buffer: file.buffer,
//         filename: s3Key,
//         contentType: file.mimetype,
//       });

//       uploadResults.push({
//         originalName: file.originalname,
//         url: result.Location,
//         key: s3Key
//       });
//     }

//     return res.status(200).json({ uploadedVideos: uploadResults });
//   } catch (error) {
//     console.error('S3 Upload Error:', error);
//     return res.status(500).json({ message: error.message || 'Failed to upload videos' });
//   }
// });

// /**
//  * Get completed courses — this must be ABOVE /:id
//  */
// router.get('/completed-courses', authenticateJWT, async (req, res) => {
//   try {
//     const userId = req.user?.id;
//     if (!userId) return res.status(401).json({ message: 'Unauthorized' });

//     const completedProgress = await UserProgress.find({
//       userId,
//       status: 'completed',
//     }).populate('courseId', 'title description price totalMinutes');

//     const completedCourses = completedProgress
//       .filter(entry => entry.courseId)
//       .map(entry => ({
//         courseId: entry.courseId._id,
//         title: entry.courseId.title,
//         description: entry.courseId.description,
//         price: entry.courseId.price,
//         totalMinutes: entry.courseId.totalMinutes,
//         progress: entry.progress,
//         completedMinutes: entry.completedMinutes,
//       }));

//     res.status(200).json({ completedCourses });
//   } catch (error) {
//     console.error('Error fetching completed courses:', error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// });

// /**
//  * Create a new course
//  */
// router.post('/create', authenticateJWT, authorizeAdmin, async (req, res) => {
//   try {
//     const { title, description, price, sections } = req.body;

//     if (!title || typeof price !== 'number' || !Array.isArray(sections)) {
//       return res.status(400).json({ message: 'Missing or invalid fields' });
//     }

//     const totalMinutes = sections.reduce((total, section) => {
//       return total + section.videos.reduce((sum, video) => sum + Number(video.duration || 0), 0);
//     }, 0);

//     const course = new Course({
//       title,
//       description,
//       price,
//       totalMinutes,
//       sections: sections.map(section => ({
//         sectionTitle: section.sectionTitle,
//         videos: section.videos.map(video => ({
//           title: video.title,
//           description: video.description,
//           url: video.url,
//           duration: video.duration,
//         })),
//       })),
//     });

//     await course.save();
//     res.status(201).json({ message: 'Course created successfully', courseId: course._id });
//   } catch (error) {
//     console.error('Course creation error:', error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// });

// /**
//  * Get all courses
//  */
// router.get('/courses', authenticateJWT, async (req, res) => {
//   try {
//     const courses = await Course.find({}, 'title description price totalMinutes sections');
//     res.status(200).json({ courses });
//   } catch (error) {
//     console.error('Error fetching courses:', error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// });

// /**
//  * Get course by ID
//  */
// router.get('/:id', authenticateJWT, async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!mongoose.Types.ObjectId.isValid(id)) {
//       return res.status(400).json({ message: 'Invalid course ID' });
//     }

//     const course = await Course.findById(id);
//     if (!course) return res.status(404).json({ message: 'Course not found' });

//     res.status(200).json(course);
//   } catch (error) {
//     console.error('Error fetching course:', error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// });

// /**
//  * Full update course by ID (PUT)
//  */
// router.put('/:id', authenticateJWT, authorizeAdmin, async (req, res) => {
//   try {
//     const { title, description, price, sections } = req.body;

//     if (!title || typeof price !== 'number' || !Array.isArray(sections)) {
//       return res.status(400).json({ message: 'Missing or invalid fields' });
//     }

//     const totalMinutes = sections.reduce((total, section) => {
//       return total + section.videos.reduce((sum, video) => sum + Number(video.duration || 0), 0);
//     }, 0);

//     const updatedCourse = await Course.findByIdAndUpdate(
//       req.params.id,
//       {
//         title,
//         description,
//         price,
//         totalMinutes,
//         sections: sections.map(section => ({
//           sectionTitle: section.sectionTitle,
//           videos: section.videos.map(video => ({
//             title: video.title,
//             description: video.description,
//             url: video.url,
//             duration: video.duration,
//           })),
//         })),
//       },
//       { new: true }
//     );

//     if (!updatedCourse) return res.status(404).json({ message: 'Course not found' });

//     res.status(200).json({ message: 'Course updated successfully', course: updatedCourse });
//   } catch (error) {
//     console.error('Course update error:', error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// });

// /**
//  * Partial update course by ID (PATCH)
//  */
// router.patch('/:id', authenticateJWT, authorizeAdmin, async (req, res) => {
//   try {
//     const updates = req.body;

//     if (updates.sections) {
//       updates.totalMinutes = updates.sections.reduce((total, section) => {
//         return total + section.videos.reduce((sum, video) => sum + Number(video.duration || 0), 0);
//       }, 0);
//     }

//     const updatedCourse = await Course.findByIdAndUpdate(
//       req.params.id,
//       { $set: updates },
//       { new: true }
//     );

//     if (!updatedCourse) return res.status(404).json({ message: 'Course not found' });

//     res.status(200).json({ message: 'Course partially updated successfully', course: updatedCourse });
//   } catch (error) {
//     console.error('Course partial update error:', error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// });

// /**
//  * Delete course by ID
//  */
// router.delete('/:id', authenticateJWT, authorizeAdmin, async (req, res) => {
//   try {
//     const deletedCourse = await Course.findByIdAndDelete(req.params.id);
//     if (!deletedCourse) return res.status(404).json({ message: 'Course not found' });

//     res.status(200).json({ message: 'Course deleted successfully' });
//   } catch (error) {
//     console.error('Course deletion error:', error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// });

// module.exports = router;

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const Course = require('../models/Course');
const User = require('../models/User');
const UserProgress = require('../models/UserProgress');
const S3Service = require('../utils/s3');
const authenticateJWT = require('../middleware/auth');
const authorizeAdmin = require('../middleware/authorizeAdmin');

// Multer setup
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 1_000_000_000 }, // 1 GB
});

// --- Video Upload ---
router.post('/upload-videos', authenticateJWT, authorizeAdmin, upload.any(), async (req, res) => {
  try {
    const maxCount = Number(req.body?.maxCount) || 100;
    const files = req.files;

    if (!files || files.length === 0) return res.status(400).json({ message: 'No files uploaded' });
    if (files.length > maxCount) return res.status(400).json({ message: `Maximum ${maxCount} files allowed` });
    if (!S3Service.isConfigured()) return res.status(500).json({ message: 'S3 not configured' });

    const uploadResults = [];

    for (const file of files) {
      const ext = file.originalname.split('.').pop();
      const s3Key = `videos/${uuidv4()}.${ext}`;

      const result = await S3Service.uploadFile({
        buffer: file.buffer,
        filename: s3Key,
        contentType: file.mimetype,
      });

      uploadResults.push({
        originalName: file.originalname,
        url: result.Location,
        key: s3Key
      });
    }

    return res.status(200).json({ uploadedVideos: uploadResults });
  } catch (error) {
    console.error('S3 Upload Error:', error);
    return res.status(500).json({ message: error.message || 'Failed to upload videos' });
  }
});

// --- Thumbnail Upload ---
router.post('/upload-thumbnail', authenticateJWT, authorizeAdmin, upload.single('thumbnail'), async (req, res) => {
  try {
    const file = req.file;

    if (!file) return res.status(400).json({ message: 'No file uploaded' });

    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({ message: 'Only image files allowed' });
    }

    const ext = file.originalname.split('.').pop();
    const s3Key = `thumbnails/${uuidv4()}.${ext}`;

    const result = await S3Service.uploadFile({
      buffer: file.buffer,
      filename: s3Key,
      contentType: file.mimetype,
    });

    return res.status(200).json({
      message: 'Thumbnail uploaded successfully',
      thumbnailUrl: result.Location,
      key: s3Key,
    });
  } catch (error) {
    console.error('Thumbnail Upload Error:', error);
    return res.status(500).json({ message: 'Failed to upload thumbnail' });
  }
});

// --- Create Course ---
router.post('/create', authenticateJWT, authorizeAdmin, async (req, res) => {
  try {
    const { title, description, price, sections, thumbnailUrl } = req.body;

    if (!title || typeof price !== 'number' || !Array.isArray(sections)) {
      return res.status(400).json({ message: 'Missing or invalid fields' });
    }

    const totalMinutes = sections.reduce((total, section) => {
      return total + section.videos.reduce((sum, video) => sum + Number(video.duration || 0), 0);
    }, 0);

    const course = new Course({
      title,
      description,
      price,
      totalMinutes,
      thumbnailUrl: thumbnailUrl || '',
      sections: sections.map(section => ({
        sectionTitle: section.sectionTitle,
        videos: section.videos.map(video => ({
          title: video.title,
          description: video.description,
          url: video.url,
          duration: video.duration,
        })),
      })),
    });

    await course.save();
    res.status(201).json({ message: 'Course created successfully', courseId: course._id });
  } catch (error) {
    console.error('Course creation error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- Get All Courses ---
router.get('/courses', authenticateJWT, async (req, res) => {
  try {
    const courses = await Course.find({}, 'title description price totalMinutes thumbnailUrl sections');
    res.status(200).json({ courses });
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/all-users', authenticateJWT, authorizeAdmin, async (req, res) => {
  try {
    const users = await User.find({}, '-password'); // exclude passwords
    const totalUsers = await User.countDocuments(); // get count

    res.status(200).json({
      total: totalUsers,
      users
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- Completed Courses ---
router.get('/completed-courses', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const completedProgress = await UserProgress.find({
      userId,
      status: 'completed',
    }).populate('courseId', 'title description price totalMinutes thumbnailUrl');

    const completedCourses = completedProgress
      .filter(entry => entry.courseId)
      .map(entry => ({
        courseId: entry.courseId._id,
        title: entry.courseId.title,
        description: entry.courseId.description,
        price: entry.courseId.price,
        totalMinutes: entry.courseId.totalMinutes,
        thumbnailUrl: entry.courseId.thumbnailUrl,
        progress: entry.progress,
        completedMinutes: entry.completedMinutes,
      }));

    res.status(200).json({ completedCourses });
  } catch (error) {
    console.error('Error fetching completed courses:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


// --- Get Course by ID ---
router.get('/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid course ID' });
    }

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    res.status(200).json(course);
  } catch (error) {
    console.error('Error fetching course:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- Update Full Course ---
router.put('/:id', authenticateJWT, authorizeAdmin, async (req, res) => {
  try {
    const { title, description, price, sections, thumbnailUrl } = req.body;

    if (!title || typeof price !== 'number' || !Array.isArray(sections)) {
      return res.status(400).json({ message: 'Missing or invalid fields' });
    }

    const totalMinutes = sections.reduce((total, section) => {
      return total + section.videos.reduce((sum, video) => sum + Number(video.duration || 0), 0);
    }, 0);

    const updatedCourse = await Course.findByIdAndUpdate(
      req.params.id,
      {
        title,
        description,
        price,
        totalMinutes,
        thumbnailUrl: thumbnailUrl || '',
        sections: sections.map(section => ({
          sectionTitle: section.sectionTitle,
          videos: section.videos.map(video => ({
            title: video.title,
            description: video.description,
            url: video.url,
            duration: video.duration,
          })),
        })),
      },
      { new: true }
    );

    if (!updatedCourse) return res.status(404).json({ message: 'Course not found' });

    res.status(200).json({ message: 'Course updated successfully', course: updatedCourse });
  } catch (error) {
    console.error('Course update error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- Partial Update Course ---
router.patch('/:id', authenticateJWT, authorizeAdmin, async (req, res) => {
  try {
    const updates = req.body;

    if (updates.sections) {
      updates.totalMinutes = updates.sections.reduce((total, section) => {
        return total + section.videos.reduce((sum, video) => sum + Number(video.duration || 0), 0);
      }, 0);
    }

    const updatedCourse = await Course.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    );

    if (!updatedCourse) return res.status(404).json({ message: 'Course not found' });

    res.status(200).json({ message: 'Course partially updated successfully', course: updatedCourse });
  } catch (error) {
    console.error('Course partial update error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- Delete Course ---
router.delete('/:id', authenticateJWT, authorizeAdmin, async (req, res) => {
  try {
    const deletedCourse = await Course.findByIdAndDelete(req.params.id);
    if (!deletedCourse) return res.status(404).json({ message: 'Course not found' });

    res.status(200).json({ message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Course deletion error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;

