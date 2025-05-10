const express = require('express');
const router = express.Router();
const UserProgress = require('../models/UserProgress');
const User = require('../models/User');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const AdminLog = require('../models/AdminLog'); // Create this model for logging
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Create rate limiter for admin routes
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});

// Apply rate limiter to all admin routes
router.use(adminLimiter);

// Admin authentication middleware
const adminAuth = async (req, res, next) => {
  // Check if user is authenticated
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized: Please log in' });
  }
  
  try {
    // Fetch the complete user object to check roles
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Check if account is active
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }
    
    // Check if user has admin role
    if (!user.roles || !user.roles.includes('admin')) {
      // Log failed admin access attempts for security monitoring
      await new AdminLog({
        actionType: 'AUTH_FAILURE',
        userId: user._id,
        details: 'Attempted to access admin area without admin role',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }).save();
      
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    
    // Add admin user info to request for logging
    req.adminUser = {
      id: user._id,
      email: user.email,
      username: user.username
    };
    
    // Log successful admin login
    await new AdminLog({
      actionType: 'AUTH_SUCCESS',
      userId: user._id,
      details: `Admin user accessed ${req.originalUrl}`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    }).save();
    
    next();
  } catch (err) {
    console.error('Error in admin authentication:', err);
    return res.status(500).json({ error: 'Internal server error during authentication' });
  }
};

// Apply admin authentication to all routes in this router
router.use(adminAuth);

// Admin action logger middleware
const logAdminAction = async (req, res, next) => {
  const originalSend = res.send;
  
  // Override res.send to log the response status
  res.send = function(body) {
    const status = res.statusCode;
    
    // Log the completed action
    new AdminLog({
      actionType: 'API_ACTION',
      userId: req.adminUser.id,
      details: `${req.method} ${req.originalUrl} - Status: ${status}`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      requestBody: JSON.stringify(req.body),
      responseStatus: status
    }).save().catch(err => {
      console.error('Error saving admin log:', err);
    });
    
    // Call the original send method
    return originalSend.call(this, body);
  };
  
  next();
};

// Apply logging to all admin routes
router.use(logAdminAction);

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

// Configure email transport with better error handling
const createTransporter = () => {
  // Check if email credentials are properly configured
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('Email configuration is missing. Please check environment variables.');
    return null;
  }
  
  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    pool: true, // use pooled connections
    maxConnections: 5, // limit simultaneous connections
    maxMessages: 100, // limit messages per connection
  });
};

// Email sending function with retry logic
const sendEmailWithRetry = async (mailOptions, retries = 3) => {
  const transporter = createTransporter();
  
  if (!transporter) {
    throw new Error('Email transporter could not be created');
  }
  
  let lastError = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Verify transporter connection
      await transporter.verify();
      
      // Send email
      const info = await transporter.sendMail(mailOptions);
      console.log(`Email sent successfully (${mailOptions.to}): ${info.messageId}`);
      
      // Log successful email
      await new AdminLog({
        actionType: 'EMAIL_SENT',
        details: `Email sent to ${mailOptions.to} - Subject: ${mailOptions.subject}`,
        metadata: { emailId: info.messageId, recipient: mailOptions.to }
      }).save();
      
      return info;
    } catch (error) {
      lastError = error;
      console.error(`Email sending attempt ${attempt} failed:`, error);
      
      // Wait before retry (exponential backoff)
      if (attempt < retries) {
        const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s, ...
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // Log failed email after all retries
  await new AdminLog({
    actionType: 'EMAIL_FAILED',
    details: `Failed to send email to ${mailOptions.to} after ${retries} attempts`,
    metadata: { error: lastError.message, recipient: mailOptions.to }
  }).save().catch(console.error);
  
  throw new Error(`Failed to send email after ${retries} attempts: ${lastError.message}`);
};

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
      enrolledAt: new Date(),
      enrolledBy: req.adminUser.id
    });
    await enrollment.save();
    
    // Send email notification with improved error handling
    let emailSent = false;
    try {
      const mailOptions = {
        from: `"${process.env.SITE_NAME || 'Learning Platform'}" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: `Course Access Granted: ${course.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
            <h2 style="color: #4a90e2;">Course Access Granted</h2>
            <p>Dear ${user.username || 'Student'},</p>
            <p>We're pleased to inform you that you've been granted access to the following course:</p>
            <h3 style="background-color: #f0f2f5; padding: 10px; border-radius: 4px;">${course.title}</h3>
            <p>You can now access this course through your learning dashboard.</p>
            <p><a href="${process.env.SITE_URL || 'https://learningplatform.com'}/dashboard" 
                  style="background-color: #4a90e2; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px; display: inline-block;">
                  Go to Dashboard
               </a></p>
            <p>Happy learning!</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="font-size: 12px; color: #6c757d;">This is an automated message. Please do not reply to this email.</p>
          </div>
        `
      };
      
      await sendEmailWithRetry(mailOptions);
      emailSent = true;
      console.log(`Email sent to ${user.email} for course ${course.title}`);
    } catch (emailError) {
      console.error('Failed to send email notification:', emailError);
      emailSent = false;
    }
    
    // Log the action with outcome
    await new AdminLog({
      actionType: 'COURSE_ACCESS_GRANTED',
      userId: req.adminUser.id,
      details: `Granted access to "${course.title}" for user ${user.email}`,
      metadata: { 
        courseId: course._id, 
        recipientId: user._id,
        emailSent 
      }
    }).save();
    
    return res.json({
      message: emailSent 
        ? 'Access granted successfully. Email notification sent to user.'
        : 'Access granted successfully, but email notification failed. User has access to the course.',
      emailSent: emailSent
    });
  } catch (err) {
    console.error('Error granting access:', err);
    res.status(500).json({ error: 'Error granting access' });
  }
});

// Manage admin users route
router.get('/manage-admins', async (req, res) => {
  try {
    const admins = await User.find(
      { roles: 'admin' }, 
      { username: 1, email: 1, lastLogin: 1, status: 1 }
    );
    
    res.json(admins);
  } catch (err) {
    console.error('Error fetching admin users:', err);
    res.status(500).json({ error: 'Failed to fetch admin users' });
  }
});

// Add admin role to a user
router.post('/add-admin', async (req, res) => {
  try {
    const { email, securityCode } = req.body;
    
    // Verify security code matches environment variable 
    if (!securityCode || securityCode !== process.env.ADMIN_SECURITY_CODE) {
      // Log invalid security code attempt
      await new AdminLog({
        actionType: 'SECURITY_VIOLATION',
        userId: req.adminUser.id,
        details: 'Invalid security code used when attempting to add admin role',
        ipAddress: req.ip
      }).save();
      
      return res.status(403).json({ error: 'Invalid security code' });
    }
    
    // Find user by email
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Skip if already an admin
    if (user.roles.includes('admin')) {
      return res.json({ 
        message: 'User already has admin privileges',
        user: {
          email: user.email,
          username: user.username,
          roles: user.roles
        }
      });
    }
    
    // Add admin role
    user.roles.push('admin');
    await user.save();
    
    // Log this critical action
    await new AdminLog({
      actionType: 'ADMIN_ROLE_ADDED',
      userId: req.adminUser.id,
      details: `Admin role granted to ${user.email} by ${req.adminUser.email}`,
      ipAddress: req.ip,
      severity: 'HIGH'
    }).save();
    
    return res.json({
      message: 'Admin role added successfully',
      user: {
        email: user.email,
        username: user.username,
        roles: user.roles
      }
    });
  } catch (err) {
    console.error('Error adding admin role:', err);
    res.status(500).json({ error: 'Failed to add admin role' });
  }
});

// Remove admin role from a user
router.post('/remove-admin', async (req, res) => {
  try {
    const { userId, securityCode } = req.body;
    
    // Verify security code
    if (!securityCode || securityCode !== process.env.ADMIN_SECURITY_CODE) {
      // Log invalid security code attempt
      await new AdminLog({
        actionType: 'SECURITY_VIOLATION',
        userId: req.adminUser.id,
        details: 'Invalid security code used when attempting to remove admin role',
        ipAddress: req.ip
      }).save();
      
      return res.status(403).json({ error: 'Invalid security code' });
    }
    
    // Prevent self-removal
    if (userId === req.adminUser.id.toString()) {
      return res.status(400).json({ error: 'Cannot remove your own admin privileges' });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Remove admin role
    user.roles = user.roles.filter(role => role !== 'admin');
    await user.save();
    
    // Log this critical action
    await new AdminLog({
      actionType: 'ADMIN_ROLE_REMOVED',
      userId: req.adminUser.id,
      details: `Admin role removed from ${user.email} by ${req.adminUser.email}`,
      ipAddress: req.ip,
      severity: 'HIGH'
    }).save();
    
    return res.json({
      message: 'Admin role removed successfully',
      user: {
        email: user.email,
        username: user.username,
        roles: user.roles
      }
    });
  } catch (err) {
    console.error('Error removing admin role:', err);
    res.status(500).json({ error: 'Failed to remove admin role' });
  }
});

// Serve admin dashboard
router.get('/dashboard', (req, res) => {
  res.render('admin/dashboard', { 
    title: 'Admin Dashboard',
    user: req.adminUser
  });
});

module.exports = router;