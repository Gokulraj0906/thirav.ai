const express = require('express');
const router = express.Router();
const UserProgress = require('../models/UserProgress');
const User = require('../models/User');
const Course = require('../models/Course');

// Get all user progress
router.get('/progress-review', async (req, res) => {
  try {
    const data = await UserProgress.find()
      .populate('userId', 'email username')
      .populate('courseId', 'title');

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user progress' });
  }
});


const Enrollment = require('../models/Enrollment');
router.post('/grant-access', async (req, res) => {
  const { email, courseName } = req.body;

  try {
    const user = await User.findOne({ email });
    const course = await Course.findOne({ title: courseName });

    if (!user || !course) {
      return res.status(404).json({ error: 'User or course not found' });
    }

    // Check if already enrolled
    const existing = await UserProgress.findOne({ userId: user._id, courseId: course._id });
    if (existing) {
      return res.json({ message: 'User already has access to this course' });
    }

    const progress = new UserProgress({
      userId: user._id,
      courseId: course._id,
      totalMinutes: course.totalMinutes || 0
    });

    await progress.save();
    return res.json({ message: 'Access granted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error granting access' });
  }
});


module.exports = router;
