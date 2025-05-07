const express = require('express');
const router = express.Router();
const UserProgress = require('../models/UserProgress');
const User = require('../models/User');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Admin authentication middleware
const adminAuth = async (req, res, next) => {
  // Check if user is authenticated
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized: Please log in' });
  }
  
  // Check if user is the authorized admin
  // Using environment variable for admin user ID
  if (req.user._id.toString() !== process.env.ADMIN_USER_ID) {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
  
  next();
};

// Apply admin authentication to all routes in this router
router.use(adminAuth);

// Get all user progress
router.get('/progress-review', async (req, res) => {
  try {
    const data = await UserProgress.find()
      .populate('userId', 'email username')
      .populate('courseId', 'title videos totalMinutes');
    
    res.json(data);
  } catch (err) {
    console.error('Error fetching progress data:', err);
    res.status(500).json({ error: 'Failed to fetch user progress' });
  }
});

// Email configuration for notifications
const transporter = nodemailer.createTransport({
  service: 'gmail', // or another service
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Grant course access to user
router.post('/grant-access', async (req, res) => {
  const { email, courseName } = req.body;
  
  if (!email || !courseName) {
    return res.status(400).json({ error: 'Email and course name are required' });
  }

  try {
    // Find user and course
    const user = await User.findOne({ email });
    const course = await Course.findOne({ title: courseName });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }
    
    // Check if already enrolled
    const existingProgress = await UserProgress.findOne({
      userId: user._id,
      courseId: course._id
    });
    
    if (existingProgress) {
      return res.json({ message: 'User already has access to this course' });
    }
    
    // Create new UserProgress entry
    const progress = new UserProgress({
      userId: user._id,
      courseId: course._id,
      completedMinutes: 0,
      progress: 0,
      totalMinutes: course.totalMinutes || 0,
      status: 'in progress'
    });
    await progress.save();
    
    // Create new Enrollment entry
    const enrollment = new Enrollment({
      userId: user._id,
      courseId: course._id,
      enrolledAt: new Date()
    });
    await enrollment.save();
    
    // Send email notification
    try {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: `Course Access Granted: ${course.title}`,
        html: `
          <h2>Course Access Granted</h2>
          <p>Dear ${user.username || 'Student'},</p>
          <p>We're pleased to inform you that you've been granted access to the following course:</p>
          <h3>${course.title}</h3>
          <p>You can now access this course through your learning dashboard.</p>
          <p>Happy learning!</p>
        `
      };
      
      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      // Continue with success response even if email fails
    }
    
    return res.json({
      message: 'Access granted successfully. Email notification sent to user.'
    });
  } catch (err) {
    console.error('Error granting access:', err);
    res.status(500).json({ error: 'Error granting access' });
  }
});

module.exports = router;