// const express = require('express');
// const router = express.Router();
// const multer = require('multer');
// const { v4: uuidv4 } = require('uuid');
// const Course = require('../models/Course');
// const s3 = require('../utils/s3');
// const authenticateJWT = require('../middleware/auth');
// const authorizeAdmin = require('../middleware/authorizeAdmin');
// const UserProgress = require('../models/UserProgress');
// // Multer config
// const storage = multer.memoryStorage();
// const upload = multer({ storage, limits: { fileSize: 1000000000 } });

// // Upload videos to S3
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

//     const uploadResults = [];
//     for (const file of files) {
//       const ext = file.originalname.split('.').pop();
//       const s3Key = `videos/${uuidv4()}.${ext}`;
//       const params = {
//         Bucket: process.env.AWS_BUCKET_NAME,
//         Key: s3Key,
//         Body: file.buffer,
//         ContentType: file.mimetype,
//       };
//       const data = await s3.upload(params).promise();
//       uploadResults.push({ originalName: file.originalname, url: data.Location });
//     }

//     res.status(200).json({ uploadedVideos: uploadResults });
//   } catch (error) {
//     console.error('S3 Upload Error:', error);
//     res.status(500).json({ message: 'Error uploading videos to S3' });
//   }
// });

// // Create a new course
// router.post('/create', authenticateJWT, authorizeAdmin, async (req, res) => {
//   try {
//     const { title, description, price, sections } = req.body;

//     if (!title || typeof price !== 'number' || !Array.isArray(sections)) {
//       return res.status(400).json({ message: 'Missing or invalid fields' });
//     }

//     let totalMinutes = 0;
//     sections.forEach(section => {
//       section.videos.forEach(video => {
//         totalMinutes += Number(video.duration || 0);
//       });
//     });

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

// // Get all courses
// router.get('/courses', authenticateJWT, async (req, res) => {
//   try {
//     const courses = await Course.find({}, 'title description price totalMinutes sections');
//     res.status(200).json({ courses });
//   } catch (error) {
//     console.error('Error fetching courses:', error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// });

// // Get course by ID
// router.get('/:id', authenticateJWT, async (req, res) => {
//   try {
//     const course = await Course.findById(req.params.id);
//     if (!course) return res.status(404).json({ message: 'Course not found' });
//     res.status(200).json(course);
//   } catch (error) {
//     console.error('Error fetching course:', error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// });

// // Full update course by ID (replace entire course data)
// router.put('/:id', authenticateJWT, authorizeAdmin, async (req, res) => {
//   try {
//     const { title, description, price, sections } = req.body;

//     if (!title || typeof price !== 'number' || !Array.isArray(sections)) {
//       return res.status(400).json({ message: 'Missing or invalid fields' });
//     }

//     let totalMinutes = 0;
//     sections.forEach(section => {
//       section.videos.forEach(video => {
//         totalMinutes += Number(video.duration || 0);
//       });
//     });

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

// // Partial update course by ID (PATCH)
// router.patch('/:id', authenticateJWT, authorizeAdmin, async (req, res) => {
//   try {
//     const updates = req.body;

//     // If sections are updated, recalculate totalMinutes
//     if (updates.sections) {
//       let totalMinutes = 0;
//       updates.sections.forEach(section => {
//         section.videos.forEach(video => {
//           totalMinutes += Number(video.duration || 0);
//         });
//       });
//       updates.totalMinutes = totalMinutes;
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

// // Delete course by ID
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

// // ✅ This must come first!
// router.get('/completed-courses', authenticateJWT, async (req, res) => {
//   try {
//     const userId = req.user?.id;
//     if (!userId) return res.status(401).json({ message: 'Unauthorized' });

//     const completedProgress = await UserProgress.find({
//       userId: userId,
//       status: 'completed'
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
//         completedMinutes: entry.completedMinutes
//       }));

//     res.status(200).json({ completedCourses });
//   } catch (error) {
//     console.error('Error fetching completed courses:', error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// });

// module.exports = router;

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const Course = require('../models/Course');
const UserProgress = require('../models/UserProgress');
const S3Service = require('../utils/s3');
const authenticateJWT = require('../middleware/auth');
const authorizeAdmin = require('../middleware/authorizeAdmin');

// Multer setup
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 1_000_000_000 }, // 1 GB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['video/mp4', 'video/webm', 'video/mkv', 'video/quicktime'];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only video files are allowed'));
  }
});

// Upload videos to S3
router.post('/upload-videos', authenticateJWT, authorizeAdmin, upload.any(), async (req, res) => {
  try {
    const maxCount = Number(req.body?.maxCount) || 100;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    if (files.length > maxCount) {
      return res.status(400).json({ message: `Maximum ${maxCount} files are allowed` });
    }

    if (!S3Service.isConfigured()) {
      return res.status(500).json({ message: 'S3 is not configured properly' });
    }

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

// Create a new course
router.post('/create', authenticateJWT, authorizeAdmin, async (req, res) => {
  try {
    const { title, description, price, sections } = req.body;

    if (!title || typeof price !== 'number' || !Array.isArray(sections)) {
      return res.status(400).json({ message: 'Missing or invalid fields' });
    }

    let totalMinutes = 0;
    sections.forEach(section => {
      section.videos.forEach(video => {
        totalMinutes += Number(video.duration || 0);
      });
    });

    const course = new Course({
      title,
      description,
      price,
      totalMinutes,
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

// Get all courses
router.get('/courses', authenticateJWT, async (req, res) => {
  try {
    const courses = await Course.find({}, 'title description price totalMinutes sections');
    res.status(200).json({ courses });
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get course by ID
router.get('/:id', authenticateJWT, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    res.status(200).json(course);
  } catch (error) {
    console.error('Error fetching course:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Full update course by ID
router.put('/:id', authenticateJWT, authorizeAdmin, async (req, res) => {
  try {
    const { title, description, price, sections } = req.body;

    if (!title || typeof price !== 'number' || !Array.isArray(sections)) {
      return res.status(400).json({ message: 'Missing or invalid fields' });
    }

    let totalMinutes = 0;
    sections.forEach(section => {
      section.videos.forEach(video => {
        totalMinutes += Number(video.duration || 0);
      });
    });

    const updatedCourse = await Course.findByIdAndUpdate(
      req.params.id,
      {
        title,
        description,
        price,
        totalMinutes,
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

// Partial update course by ID (PATCH)
router.patch('/:id', authenticateJWT, authorizeAdmin, async (req, res) => {
  try {
    const updates = req.body;

    // If sections are updated, recalculate totalMinutes
    if (updates.sections) {
      let totalMinutes = 0;
      updates.sections.forEach(section => {
        section.videos.forEach(video => {
          totalMinutes += Number(video.duration || 0);
        });
      });
      updates.totalMinutes = totalMinutes;
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

// Delete course by ID
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

// Get completed courses for the user
router.get('/completed-courses', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const completedProgress = await UserProgress.find({
      userId: userId,
      status: 'completed'
    }).populate('courseId', 'title description price totalMinutes');

    const completedCourses = completedProgress
      .filter(entry => entry.courseId)
      .map(entry => ({
        courseId: entry.courseId._id,
        title: entry.courseId.title,
        description: entry.courseId.description,
        price: entry.courseId.price,
        totalMinutes: entry.courseId.totalMinutes,
        progress: entry.progress,
        completedMinutes: entry.completedMinutes
      }));

    res.status(200).json({ completedCourses });
  } catch (error) {
    console.error('Error fetching completed courses:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;

