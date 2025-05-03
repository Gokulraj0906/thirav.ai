// routes/enrollment.js
const express = require('express');
const router = express.Router();
const Enrollment = require('../models/Enrollment');
const UserProgress = require('../models/UserProgress');
const Course = require('../models/Course');
const mongoose = require('mongoose');

// Check if user is enrolled
router.get('/check', async (req, res) => {
  const { userId, courseId } = req.query;
  
  // Validate userId
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  // Validate courseId
  if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({ error: 'Invalid courseId' });
  }

  try {
    const enrolled = await Enrollment.findOne({ userId, courseId });
    return res.status(200).json({ enrolled: !!enrolled });
  } catch (err) {
    console.error('Enrollment check error:', err);
    return res.status(500).json({ error: 'Failed to check enrollment' });
  }
});

// Enroll a user
router.post('/enroll', async (req, res) => {
  const { userId, courseId } = req.body;

  // Validate input
  if (!userId || !courseId) {
    return res.status(400).json({ error: 'userId and courseId are required' });
  }

  // Validate userId and courseId
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'Invalid userId' });
  }
  
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({ error: 'Invalid courseId' });
  }

  try {
    // Check if already enrolled
    if (await Enrollment.findOne({ userId, courseId })) {
      return res.status(409).json({ error: 'User already enrolled in this course' });
    }

    // Find the course
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Compute totalMinutes safely
    const videos = Array.isArray(course.videos) ? course.videos : [];
    const totalMinutes = videos.reduce((sum, vid) => sum + (vid.duration || 0), 0);

    // Create enrollment record
    const enrollment = new Enrollment({ userId, courseId });
    await enrollment.save();

    // Create user progress record
    const progress = new UserProgress({
      userId,
      courseId,
      totalMinutes,
      completedMinutes: 0,
      progress: 0
    });
    await progress.save();

    return res.status(200).json({ message: 'Enrollment successful' });
  } catch (err) {
    console.error('Enrollment error:', err);
    return res.status(500).json({ error: 'Enrollment failed' });
  }
});

module.exports = router;