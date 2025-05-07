const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const passport = require('../auth/passport');
const router = express.Router();
const crypto = require('crypto');
const nodemailer = require('nodemailer');

require('dotenv').config();
const SECRET = process.env.JWT_SECRET;
const DEV_MODE = process.env.NODE_ENV !== 'production';

// Store OTP in memory (in production, consider using Redis)
const otpStore = new Map();

// Generate OTP
const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

// Generate JWT
const generateToken = user => {
  return jwt.sign(
    { id: user._id, email: user.email, username: user.username },
    SECRET,
    { expiresIn: '1d' }
  );
};

// Set auth cookies helper function
const setAuthCookies = (res, user) => {
  const name = user.username || user.displayName;
  const userId = user._id;
  
  res.cookie('userId', userId, { 
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: !DEV_MODE // Use secure in production
  });
  
  res.cookie('username', name, { 
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: !DEV_MODE // Use secure in production
  });
  
  // Add a non-httpOnly cookie for frontend access
  res.cookie('isLoggedIn', 'true', { 
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: false,
    sameSite: 'lax',
    secure: !DEV_MODE // Use secure in production
  });
};

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  // Check if authenticated via session
  if (req.isAuthenticated()) {
    return next();
  }
  
  // Check if authenticated via token
  try {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = jwt.verify(token, SECRET);
      req.user = { id: decoded.id, username: decoded.username, email: decoded.email };
      return next();
    }
  } catch (err) {
    console.error('Auth middleware error:', err);
  }
  
  // If not authenticated by either method
  return res.status(401).json({ message: 'Unauthorized' });
};

// Initialize email transporter if credentials are available
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
  try {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
    
    // Verify connection configuration
    transporter.verify(function(error, success) {
      if (error) {
        console.error('Email verification failed:', error);
        transporter = null;
      } else {
        console.log('Email server is ready to take our messages');
      }
    });
  } catch (err) {
    console.error('Failed to initialize email transporter:', err);
  }
}

// =================== TEST EMAIL CONFIG ===================
router.get('/test-email', async (req, res) => {
  try {
    if (!transporter) {
      return res.status(500).json({ 
        message: 'Email transporter not initialized',
        emailUser: process.env.EMAIL_USER ? 'Set' : 'Not set',
        emailPass: process.env.EMAIL_PASSWORD ? 'Set' : 'Not set',
        devMode: DEV_MODE
      });
    }
    
    // Try to verify the transporter
    transporter.verify(function(error, success) {
      if (error) {
        console.error('Email verification failed:', error);
        return res.status(500).json({ 
          message: 'Email verification failed', 
          error: error.message,
          emailUser: process.env.EMAIL_USER ? 'Set' : 'Not set',
          emailPass: process.env.EMAIL_PASSWORD ? 'Set' : 'Not set' 
        });
      } else {
        return res.status(200).json({ 
          message: 'Email configuration is working',
          emailUser: process.env.EMAIL_USER ? 'Set' : 'Not set',
          emailPass: process.env.EMAIL_PASSWORD ? 'Set' : 'Not set'
        });
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error testing email', error: err.message });
  }
});

// =================== REQUEST OTP ===================
router.post('/request-otp', async (req, res) => {
  const { email } = req.body;

  try {
    console.log('OTP request for email:', email);
    
    // Check if email already exists
    if (await User.findOne({ email })) {
      return res.status(400).json({ message: 'Email already registered.' });
    }

    // Generate OTP
    const otp = generateOTP();
    
    // Store OTP with 10-minute expiration
    otpStore.set(email, {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

    // For development, always log OTP to console
    if (DEV_MODE) {
      console.log('DEV MODE - Generated OTP:', otp, 'for email:', email);
    }

    // Skip email sending only if transporter is not available
    if (!transporter) {
      return res.status(200).json({ 
        message: 'OTP generated successfully (check server console for OTP)',
        ...(DEV_MODE && { devOtp: otp }) // Include OTP in response for dev mode only
      });
    }

    // Send email (regardless of mode if transporter is available)
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: email,
        subject: 'Your OTP for Registration - thirav.ai',
        html: `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Email Verification</title>
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
              .verification-code {
                font-size: 32px;
                font-weight: bold;
                letter-spacing: 4px;
                text-align: center;
                margin: 20px 0;
                color: #007bff;
                padding: 10px;
                background-color: #f8f9fa;
                border-radius: 4px;
              }
              .email-footer {
                background-color: #f8f9fa;
                padding: 15px;
                text-align: center;
                font-size: 12px;
                color: #666;
              }
              p {
                margin-bottom: 15px;
              }
              .expiry-notice {
                color: #dc3545;
                font-size: 14px;
                margin-top: 15px;
              }
              .logo {
                font-size: 26px;
                font-weight: bold;
                margin-bottom: 10px;
              }
              .logo span {
                color:rgb(0, 0, 0);
              }
            </style>
          </head>
          <body>
            <div class="email-container">
              <div class="email-header">
                <div class="logo">thirav<span>.ai</span></div>
                <h1>Email Verification</h1>
              </div>
              <div class="email-body">
                <p>Hello,</p>
                <p>Thank you for registering with thirav.ai! To complete your registration, please use the verification code below:</p>
                
                <div class="verification-code">${otp}</div>
                
                <p>Enter this code on the verification page to activate your account.</p>
                <p class="expiry-notice">This code will expire in 10 minutes for security reasons.</p>
                <p>If you did not request this code, please disregard this email.</p>
              </div>
              <div class="email-footer">
                <p>&copy; ${new Date().getFullYear()} thirav.ai. All rights reserved.</p>
                <p>This is an automated message, please do not reply to this email.</p>
              </div>
            </div>
          </body>
          </html>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log('OTP email sent successfully to', email);
      
      res.status(200).json({ 
        message: 'OTP sent to your email. Please verify to complete registration.',
        ...(DEV_MODE && { devOtp: otp }) // Include OTP in response for dev mode only
      });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      
      // If email sending fails but we're in dev mode, still return success with OTP
      if (DEV_MODE) {
        return res.status(200).json({ 
          message: 'Generated OTP but email sending failed. Check OTP in server logs.',
          devOtp: otp
        });
      } else {
        return res.status(500).json({ message: 'Failed to send verification email' });
      }
    }
  } catch (err) {
    console.error('OTP Request Error:', err);
    res.status(500).json({ message: 'Failed to process OTP request', error: err.message });
  }
});

// =================== VERIFY OTP & COMPLETE SIGNUP ===================
router.post('/verify-otp', async (req, res) => {
  const { username, email, password, otp } = req.body;

  try {
    // Check if OTP exists and is valid
    const otpData = otpStore.get(email);
    
    if (!otpData) {
      return res.status(400).json({ message: 'OTP not requested or expired. Please request a new OTP.' });
    }

    if (otpData.expiresAt < Date.now()) {
      // Clean up expired OTP
      otpStore.delete(email);
      return res.status(400).json({ message: 'OTP expired. Please request a new OTP.' });
    }

    if (otpData.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
    }

    // OTP is valid, create the user
    const hash = await bcrypt.hash(password, 10);
    const newUser = await User.create({ 
      username, 
      email, 
      password: hash,
      emailVerified: true // Mark email as verified
    });

    // Clean up used OTP
    otpStore.delete(email);

    const token = generateToken(newUser);
    
    // Set cookies for authentication
    setAuthCookies(res, newUser);
    
    // Also set the JWT token as a cookie
    res.cookie('token', token, { 
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: !DEV_MODE
    });

    // Log in the user after signup
    req.login(newUser, err => {
      if (err) {
        console.error('Login after signup error:', err);
      }
      
      res.status(201).json({
        message: 'Signup successful',
        token,
        user: { id: newUser._id, username: newUser.username, email: newUser.email }
      });
    });
  } catch (err) {
    console.error('OTP Verification Error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// =================== RESEND OTP ===================
router.post('/resend-otp', async (req, res) => {
  const { email } = req.body;

  try {
    // Check if email already exists
    if (await User.findOne({ email })) {
      return res.status(400).json({ message: 'Email already registered.' });
    }

    // Generate new OTP
    const otp = generateOTP();
    
    // Store OTP with 10-minute expiration
    otpStore.set(email, {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

    // For development, always log OTP to console
    if (DEV_MODE) {
      console.log('DEV MODE - Resent OTP:', otp, 'for email:', email);
    }

    // Skip email sending only if transporter is not available
    if (!transporter) {
      return res.status(200).json({ 
        message: 'New OTP generated successfully (check server console for OTP)',
        ...(DEV_MODE && { devOtp: otp }) // Include OTP in response for dev mode only
      });
    }

    // Send email (regardless of mode if transporter is available)
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: email,
        subject: 'Your New OTP for Registration - thirav.ai',
        html: `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Email Verification</title>
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
              .verification-code {
                font-size: 32px;
                font-weight: bold;
                letter-spacing: 4px;
                text-align: center;
                margin: 20px 0;
                color: #007bff;
                padding: 10px;
                background-color: #f8f9fa;
                border-radius: 4px;
              }
              .email-footer {
                background-color: #f8f9fa;
                padding: 15px;
                text-align: center;
                font-size: 12px;
                color: #666;
              }
              p {
                margin-bottom: 15px;
              }
              .expiry-notice {
                color: #dc3545;
                font-size: 14px;
                margin-top: 15px;
              }
              .logo {
                font-size: 26px;
                font-weight: bold;
                margin-bottom: 10px;
              }
              .logo span {
                color:rgb(0, 0, 0);
              }
            </style>
          </head>
          <body>
            <div class="email-container">
              <div class="email-header">
                <div class="logo">thirav<span>.ai</span></div>
                <h1>New Verification Code</h1>
              </div>
              <div class="email-body">
                <p>Hello,</p>
                <p>You've requested a new verification code for your thirav.ai account. Please use the code below to complete your registration:</p>
                
                <div class="verification-code">${otp}</div>
                
                <p>Enter this code on the verification page to activate your account.</p>
                <p class="expiry-notice">This code will expire in 10 minutes for security reasons.</p>
                <p>If you did not request this code, please disregard this email.</p>
              </div>
              <div class="email-footer">
                <p>&copy; ${new Date().getFullYear()} thirav.ai. All rights reserved.</p>
                <p>This is an automated message, please do not reply to this email.</p>
              </div>
            </div>
          </body>
          </html>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log('New OTP email sent successfully to', email);
      
      res.status(200).json({ 
        message: 'New OTP sent to your email.',
        ...(DEV_MODE && { devOtp: otp }) // Include OTP in response for dev mode only
      });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      

      if (DEV_MODE) {
        return res.status(200).json({ 
          message: 'Generated new OTP but email sending failed. Check OTP in server logs.',
          devOtp: otp
        });
      } else {
        return res.status(500).json({ message: 'Failed to send verification email' });
      }
    }
  } catch (err) {
    console.error('Resend OTP Error:', err);
    res.status(500).json({ message: 'Failed to resend OTP', error: err.message });
  }
});

// =================== LOGIN ===================
router.post('/login', async (req, res, next) => {
  passport.authenticate('local-login', { session: true }, (err, user, info) => {
    if (err || !user) {
      return res.status(400).json({ message: 'Login failed', error: info?.message || err });
    }

    // Log the user in - establish session
    req.login(user, err => {
      if (err) {
        return next(err);
      }
      
      const token = generateToken(user);
      
      // Set cookies for userId and username
      setAuthCookies(res, user);
      
      // Also set the JWT token as a cookie
      res.cookie('token', token, { 
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: !DEV_MODE
      });
      
      res.json({
        message: 'Login successful',
        token,
        user: { id: user._id, username: user.username, email: user.email }
      });
    });
  })(req, res, next);
});

// =================== PROTECTED ROUTE TEST ===================
router.get('/protected-test', isAuthenticated, (req, res) => {
  res.json({ 
    message: 'You are authenticated!',
    user: req.user
  });
});

// =================== UPDATE USERNAME ===================
router.patch('/update-username', isAuthenticated, async (req, res) => {
  try {
    let userId;
    
    // Get user ID from req.user (set by isAuthenticated middleware)
    userId = req.user.id || req.user._id;
    
    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ message: 'User not found' });

    const { newUsername } = req.body;
    if (!newUsername) {
      return res.status(400).json({ message: 'New username is required.' });
    }

    user.username = newUsername;
    const updatedUser = await user.save();
    
    // Update cookie with new username
    res.cookie('username', newUsername, { 
      maxAge: 24 * 60 * 60 * 1000, 
      httpOnly: true,
      sameSite: 'lax',
      secure: !DEV_MODE
    });

    res.status(200).json({ 
      message: 'Username updated successfully', 
      user: { 
        id: updatedUser._id, 
        username: updatedUser.username, 
        email: updatedUser.email 
      } 
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// =================== OAUTH ROUTES (Session-Based) ===================
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    // Set cookies after successful OAuth login
    if (req.user) {
      setAuthCookies(res, req.user);
      
      // Also set the JWT token
      const token = generateToken(req.user);
      res.cookie('token', token, { 
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: !DEV_MODE
      });
    }
    res.redirect('/dashboard');
  }
);

router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));
router.get('/github/callback',
  passport.authenticate('github', { failureRedirect: '/' }),
  (req, res) => {
    // Set cookies after successful OAuth login
    if (req.user) {
      setAuthCookies(res, req.user);
      
      // Also set the JWT token
      const token = generateToken(req.user);
      res.cookie('token', token, { 
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: !DEV_MODE
      });
    }
    res.redirect('/dashboard');
  }
);

router.get('/linkedin', passport.authenticate('linkedin-openid'));
router.get('/linkedin/callback',
  passport.authenticate('linkedin-openid', { failureRedirect: '/' }),
  (req, res) => {
    // Set cookies after successful OAuth login
    if (req.user) {
      setAuthCookies(res, req.user);
      
      // Also set the JWT token
      const token = generateToken(req.user);
      res.cookie('token', token, { 
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: !DEV_MODE
      });
    }
    res.redirect('/dashboard');
  }
);

// =================== LOGOUT ===================
router.get('/logout', (req, res) => {
  // Clear all auth cookies
  res.clearCookie('userId');
  res.clearCookie('username');
  res.clearCookie('isLoggedIn');
  res.clearCookie('token');
  
  req.logout(() => res.redirect('/'));
});

// =================== DELETE ACCOUNT ===================
router.delete('/delete-account', isAuthenticated, async (req, res) => {
  try {
    let userId = req.user.id || req.user._id;
    
    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ message: 'User not found' });

    await User.deleteOne({ _id: user._id });
    
    // Clear cookies
    res.clearCookie('userId');
    res.clearCookie('username');
    res.clearCookie('isLoggedIn');
    res.clearCookie('token');
    
    // Log out if using session auth
    if (req.isAuthenticated()) {
      req.logout(() => {});
    }
    
    res.status(200).json({ message: 'Account deleted successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// =================== CHECK LOGIN STATUS ===================
router.get('/isLoggedIn', (req, res) => {
  if (req.isAuthenticated() && req.user) {
    res.json({ 
      isLoggedIn: true,
      userId: req.user._id,
      username: req.user.username || req.user.displayName
    });
  } else {
    // Try to verify via token
    try {
      const token = req.cookies.token;
      if (token) {
        const decoded = jwt.verify(token, SECRET);
        return res.json({ 
          isLoggedIn: true,
          userId: decoded.id,
          username: decoded.username
        });
      }
    } catch (err) {
      console.error('Token verification error:', err);
    }
    
    res.json({ isLoggedIn: false });
  }
});

router.get('/user-info', isAuthenticated, (req, res) => {
  res.json({
    userId: req.user.id || req.user._id,
    username: req.user.username || req.user.displayName,
    email: req.user.email
  });
});

module.exports = router;