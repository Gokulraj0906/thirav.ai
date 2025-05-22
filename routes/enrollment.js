const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const UserProgress = require('../models/UserProgress');
const Course = require('../models/Course');
const Payment = require('../models/Payment');
const authenticateJWT = require('../middleware/auth');


// Check if user is enrolled
router.get('/check', authenticateJWT, async (req, res) => {
  const { userId, courseId } = req.query;
  
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  if (!userId || !courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({ message: 'Invalid userId or courseId' });
  }

  try {
    const enrolled = await Enrollment.findOne({ user: userId, course: courseId });
    return res.status(200).json({ enrolled: !!enrolled });
  } catch (err) {
    console.error('Enrollment check error:', err);
    return res.status(500).json({ message: 'Failed to check enrollment' });
  }
});

//Enroll a user ONLY after successful payment
router.post('/enroll', authenticateJWT, async (req, res) => {
  const { courseId, userId } = req.body || req.query;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: 'Invalid or missing userId' });
  }

  if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({ message: 'Invalid or missing courseId' });
  }

  try {
    const payment = await Payment.findOne({
      user: userId,
      course: courseId,
      status: 'success'
    });

    if (!payment) {
      return res.status(403).json({ message: 'Payment not completed for this course' });
    }

    // Check existing enrollment
    const alreadyEnrolled = await Enrollment.findOne({ user: userId, course: courseId });
    if (alreadyEnrolled) {
      return res.status(409).json({ message: 'User already enrolled in this course' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    let totalMinutes = 0;
    if (Array.isArray(course.sections)) {
      for (const section of course.sections) {
        if (Array.isArray(section.videos)) {
          totalMinutes += section.videos.reduce((sum, video) => sum + (video.duration || 0), 0);
        }
      }
    }

    const enrollment = new Enrollment({ user: userId, course: courseId });
    await enrollment.save();

    const progress = new UserProgress({
      userId,
      courseId,
      totalMinutes,
      completedMinutes: 0,
      progress: 0
    });

    await progress.save();

    return res.status(201).json({ message: 'Enrollment successful' });

  } catch (err) {
    return res.status(500).json({
      message: 'Enrollment failed',
      error: err.message,
      stack: err.stack
    });
  }
});

module.exports = router;