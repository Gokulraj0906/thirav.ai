const express = require('express');
const router = express.Router();
const UserProgress = require('../models/UserProgress');
const User = require('../models/User');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const AdminLog = require('../models/AdminLog');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const authenticateJWT = require('../middleware/auth'); // Import your JWT middleware
const authorizeAdmin = require('../middleware/authorizeAdmin'); // Import admin authorization middleware
require('dotenv').config();

// Environment configuration
const DEV_MODE = process.env.NODE_ENV === 'production';

// Rate limiter
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later'
});
router.use(adminLimiter);

// Admin logging middleware to track admin actions
const logAdminAuth = async (req, res, next) => {
  try {
    // Set admin user info for logging
    req.adminUser = {
      id: req.user._id,
      email: req.user.email,
      username: req.user.username
    };

    // Log successful admin access
    await new AdminLog({
      actionType: 'AUTH_SUCCESS',
      userId: req.user._id,
      details: `Admin user accessed ${req.originalUrl}`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    }).save();

    next();
  } catch (err) {
    console.error('Error in admin logging:', err);
    // Don't block the request if logging fails
    req.adminUser = {
      id: req.user._id,
      email: req.user.email,
      username: req.user.username
    };
    next();
  }
};

// Admin action logging middleware
const logAdminAction = async (req, res, next) => {
  const originalSend = res.send;
  res.send = function (body) {
    const status = res.statusCode;
    new AdminLog({
      actionType: 'API_ACTION',
      userId: req.adminUser.id,
      details: `${req.method} ${req.originalUrl} - Status: ${status}`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      requestBody: JSON.stringify(req.body),
      responseStatus: status
    }).save().catch(err => console.error('Error saving admin log:', err));
    return originalSend.call(this, body);
  };
  next();
};

// Apply JWT authentication first, then admin authorization, then logging
router.use(authenticateJWT);
router.use(authorizeAdmin);
router.use(logAdminAuth);
router.use(logAdminAction);

// Initialize email transporter
let transporter = null;

// Function to initialize and verify email transporter
const initializeEmailTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.warn('Email configuration incomplete: Missing EMAIL_USER or EMAIL_PASSWORD');
    return null;
  }

  try {
    const transportConfig = {
      service: process.env.EMAIL_SERVICE || 'gmail',
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    };

    const newTransporter = nodemailer.createTransport(transportConfig);
    
    // Verify configuration immediately
    newTransporter.verify((error, success) => {
      if (error) {
        console.error('Email transporter verification failed:', error);
        transporter = null;
      } else {
        console.log('Email transporter initialized and verified successfully');
        transporter = newTransporter;
      }
    });
    
    return newTransporter;
  } catch (err) {
    console.error('Failed to initialize email transporter:', err);
    return null;
  }
};

// Initialize transporter on startup
initializeEmailTransporter();

// Generate random password
const generateTempPassword = () => {
  return crypto.randomBytes(4).toString('hex');
};

// Route to test email configuration
router.get('/test-email', async (req, res) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      return res.status(500).json({
        message: 'Email configuration incomplete',
        emailUser: process.env.EMAIL_USER ? 'Set' : 'Not set',
        emailPassword: process.env.EMAIL_PASSWORD ? 'Set' : 'Not set',
        emailService: process.env.EMAIL_SERVICE || 'gmail (default)'
      });
    }
    
    // Try to initialize transporter if it's not available
    if (!transporter) {
      transporter = initializeEmailTransporter();
      
      if (!transporter) {
        return res.status(500).json({
          message: 'Failed to initialize email transporter',
          emailUser: process.env.EMAIL_USER ? 'Set' : 'Not set',
          emailPassword: process.env.EMAIL_PASSWORD ? 'Set' : 'Not set'
        });
      }
    }
    
    // Verify transporter
    transporter.verify((error, success) => {
      if (error) {
        return res.status(500).json({
          message: 'Email configuration verification failed',
          error: error.message
        });
      } else {
        return res.status(200).json({
          message: 'Email configuration is working properly',
          success: true
        });
      }
    });
  } catch (err) {
    console.error('Error testing email configuration:', err);
    res.status(500).json({
      message: 'Error testing email configuration',
      error: err.message
    });
  }
});

// Grant course access
router.post('/grant-access', async (req, res) => {
  const { email, courseName, courseId } = req.body;
  
  if (!email || (!courseName && !courseId)) {
    return res.status(400).json({ error: 'Email and either courseName or courseId are required' });
  }

  try {
    // Try to initialize transporter if it's not already available
    if (!transporter) {
      transporter = initializeEmailTransporter();
    }
    
    // Log email config status
    const emailConfigStatus = {
      transporterAvailable: !!transporter,
      emailUser: process.env.EMAIL_USER ? 'Set' : 'Not set',
      emailPassword: process.env.EMAIL_PASSWORD ? 'Set' : 'Not set',
      emailService: process.env.EMAIL_SERVICE || 'gmail (default)'
    };

    
    // Find or create user
    let user = await User.findOne({ email });
    let isNewUser = false;
    let tempPassword = null;

    if (!user) {
      tempPassword = generateTempPassword();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      user = new User({
        email,
        username: email.split('@')[0],
        password: hashedPassword,
        roles: ['user'],
        status: 'active'
      });

      await user.save();
      isNewUser = true;
    }

    // Find course
    let course = courseId
      ? await Course.findById(courseId)
      : await Course.findOne({ title: courseName });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check for existing progress
    const existingProgress = await UserProgress.findOne({ 
      userId: user._id, 
      courseId: course._id 
    });
    
    // If user already has access, just return success
    if (existingProgress) {
      return res.json({ 
        message: 'User already has access to this course',
        success: true,
        courseTitle: course.title,
        userEmail: user.email
      });
    }

    // Create User Progress
    const progress = new UserProgress({
      userId: user._id,
      courseId: course._id,
      completedMinutes: 0,
      progress: 0,
      totalMinutes: course.totalMinutes || 0,
      status: 'in progress'
    });
    await progress.save();

    // Create enrollment
    const enrollment = new Enrollment({
      user: user._id,
      course: course._id,
      enrolledAt: new Date()
    });
    await enrollment.save();

    let emailSent = false;
    let emailError = null;
    
    // Prepare email content
    const mailOptions = {
      from: `"${process.env.SITE_NAME || 'Thirav.ai'}" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `Course Access Granted: ${course.title}`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Course Access Granted</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .email-container {
              border-radius: 8px;
              overflow: hidden;
              border: 1px solid #e0e0e0;
              box-shadow: 0 4px 8px rgba(0,0,0,0.05);
            }
            .email-header {
              background-color: #007bff;
              color: white;
              padding: 20px;
              text-align: center;
            }
            .email-header h1 {
              margin: 0;
              font-size: 24px;
            }
            .email-body {
              background-color: #ffffff;
              padding: 30px;
            }
            .course-info {
              font-size: 18px;
              font-weight: bold;
              text-align: center;
              margin: 20px 0;
              color: #007bff;
              padding: 10px;
              background-color: #f8f9fa;
              border-radius: 4px;
            }
            .password-info {
              font-size: 16px;
              font-weight: bold;
              text-align: center;
              margin: 20px 0;
              color: #dc3545;
              padding: 10px;
              background-color: #f8f9fa;
              border-radius: 4px;
            }
            .cta-button {
              display: inline-block;
              padding: 12px 24px;
              background-color: #007bff;
              color: white;
              text-decoration: none;
              border-radius: 4px;
              font-weight: bold;
              margin: 20px 0;
            }
            .email-footer {
              background-color: #f8f9fa;
              padding: 15px;
              text-align: center;
              font-size: 12px;
              color: #666;
            }
            .logo {
              font-size: 26px;
              font-weight: bold;
              margin-bottom: 10px;
            }
            .logo span {
              color: rgb(0, 0, 0);
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="email-header">
              <div class="logo">thirav<span>.ai</span></div>
              <h1>Course Access Granted</h1>
            </div>
            <div class="email-body">
              <p>Hello ${user.username || 'Student'},</p>
              <p>Great news! You've been granted access to the following course:</p>
              
              <div class="course-info">${course.title}</div>
              
              ${isNewUser ? `
              <p>Since this is your first time with us, we've created an account for you:</p>
              <div class="password-info">Your temporary password is: ${tempPassword}</div>
              <p>Please change this password after your first login for security.</p>
              ` : ''}
              
              <p>You can access your course immediately by clicking the button below:</p>
              
              <div style="text-align: center;">
                <a href="${process.env.SITE_URL || 'https://thirav.ai'}/dashboard" class="cta-button">Go to Your Dashboard</a>
              </div>
              
              <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
              <p>Happy learning!</p>
            </div>
            <div class="email-footer">
              <p>&copy; ${new Date().getFullYear()} thirav.ai. All rights reserved.</p>
              <p>This is an automated message, please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Course Access Granted: ${course.title}

Hello ${user.username || 'Student'},

Great news! You've been granted access to the following course: ${course.title}

${isNewUser ? `Since this is your first time with us, we've created an account for you.\nYour temporary password is: ${tempPassword}\nPlease change this password after your first login for security.` : ''}

You can access your course immediately by visiting: ${process.env.SITE_URL || 'https://thirav.ai'}/dashboard

If you have any questions or need assistance, please don't hesitate to contact our support team.

Happy learning!

© ${new Date().getFullYear()} thirav.ai. All rights reserved.
This is an automated message, please do not reply to this email.
      `
    };
    
    // Attempt to send email if transporter is available
    if (transporter) {
      try {
        const info = await transporter.sendMail(mailOptions);
        emailSent = true;
        
        // Log successful email
        await new AdminLog({
          actionType: 'EMAIL_SENT',
          userId: req.adminUser.id,
          details: `Email sent to ${user.email} for course "${course.title}"`,
          metadata: { messageId: info.messageId }
        }).save();
      } catch (err) {
        emailError = err.message;
        console.error('Failed to send email:', err);
        
        // Log email failure
        await new AdminLog({
          actionType: 'EMAIL_FAILED',
          userId: req.adminUser.id,
          details: `Failed to send email to ${user.email}`,
          metadata: { error: err.message }
        }).save();
      }
    } else {
      emailError = "Email transporter not available";
      console.warn('Email transporter not available, skipping email send');
      
      // For development mode, log the temp password even if email fails
    }

    // Log the access grant
    await new AdminLog({
      actionType: 'COURSE_ACCESS_GRANTED',
      userId: req.adminUser.id,
      details: `Granted "${course.title}" to ${user.email}`,
      metadata: {
        courseId: course._id,
        recipientId: user._id,
        emailSent,
        emailError,
        isNewUser
      }
    }).save();

    // Return appropriate response
    res.json({
      message: emailSent ? 'Access granted & email sent' : 'Access granted but email failed',
      success: true,
      emailSent,
      emailError,
      courseTitle: course.title,
      userEmail: user.email,
      isNewUser,
      tempPassword: DEV_MODE && isNewUser ? tempPassword : undefined,
      emailConfig: {
        userSet: !!process.env.EMAIL_USER,
        passSet: !!process.env.EMAIL_PASSWORD,
        serviceSet: !!process.env.EMAIL_SERVICE,
        hostSet: !!process.env.EMAIL_HOST
      }
    });
  } catch (err) {
    console.error('Grant access error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message,
      stack: DEV_MODE ? err.stack : undefined
    });
  }
});

// Get all user progress
router.get('/progress-review', async (req, res) => {
  try {
    const data = await UserProgress.find()
      .populate('userId', 'email username')
      .populate('courseId', 'title totalMinutes');
    res.json(data);
  } catch (err) {
    console.error('Fetch progress error:', err);
    res.status(500).json({ error: 'Failed to fetch user progress' });
  }
});

module.exports = router;