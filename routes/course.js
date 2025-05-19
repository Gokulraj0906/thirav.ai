const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const Course = require('../models/Course');
const s3 = require('../utils/s3');

// Multer config
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 1000000000 } });

// Simple auth middleware
function checkAuth(req, res, next) {
  if (req.cookies.userId !== process.env.USER_ID) {
    return res.status(403).json({ message: 'Unauthorized' });
  }
  next();
}

// Upload videos to S3
router.post('/upload-videos', checkAuth, upload.any(), async (req, res) => {
  try {
    const maxCount = Number(req.body?.maxCount) || 100;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }
    if (files.length > maxCount) {
      return res.status(400).json({ message: `Maximum ${maxCount} files are allowed` });
    }

    const uploadResults = [];
    for (const file of files) {
      const ext = file.originalname.split('.').pop();
      const s3Key = `videos/${uuidv4()}.${ext}`;
      const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype,
      };
      const data = await s3.upload(params).promise();
      uploadResults.push({ originalName: file.originalname, url: data.Location });
    }

    res.status(200).json({ uploadedVideos: uploadResults });
  } catch (error) {
    console.error('S3 Upload Error:', error);
    res.status(500).json({ message: 'Error uploading videos to S3' });
  }
});

// Create a new course
router.post('/create', checkAuth, async (req, res) => {
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
router.get('/courses', async (req, res) => {
  try {
    const courses = await Course.find({}, 'title description price totalMinutes sections');
    res.status(200).json({ courses });
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get course by ID
router.get('/:id', async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    res.status(200).json(course);
  } catch (error) {
    console.error('Error fetching course:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Full update course by ID (replace entire course data)
router.put('/:id', checkAuth, async (req, res) => {
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
router.patch('/:id', checkAuth, async (req, res) => {
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
router.delete('/:id', checkAuth, async (req, res) => {
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