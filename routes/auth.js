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
    sameSite: 'lax'
  });
  
  res.cookie('username', name, { 
    maxAge: 24 * 60 * 60 * 1000, 
    httpOnly: true,
    sameSite: 'lax'
  });
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
        subject: 'Your OTP for Registration',
        html: `
          <h1>Email Verification</h1>
          <p>Your verification code is: <strong>${otp}</strong></p>
          <p>This code will expire in 10 minutes.</p>
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
    
    // Set cookies for userId and username
    setAuthCookies(res, newUser);

    // Log in the user after signup
    req.login(newUser, err => {
      if (err) {
        console.error('Login after signup error:', err);
      }
    });

    res.status(201).json({
      message: 'Signup successful',
      token,
      user: { id: newUser._id, username: newUser.username, email: newUser.email }
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
        subject: 'Your New OTP for Registration',
        html: `
          <h1>Email Verification</h1>
          <p>Your new verification code is: <strong>${otp}</strong></p>
          <p>This code will expire in 10 minutes.</p>
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
      
      // If email sending fails but we're in dev mode, still return success with OTP
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
      
      res.json({
        message: 'Login successful',
        token,
        user: { id: user._id, username: user.username, email: user.email }
      });
    });
  })(req, res, next);
});

// =================== UPDATE USERNAME ===================
router.patch('/update-username', async (req, res) => {
  // Use either session or JWT for authentication
  try {
    let userId;
    
    // First check if user is logged in via session
    if (req.isAuthenticated() && req.user) {
      userId = req.user._id;
    } 
    // If not, check JWT token
    else {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        return res.status(401).json({ message: 'No authentication token provided' });
      }
      
      const decoded = jwt.verify(token, SECRET);
      userId = decoded.id;
    }
    
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
      sameSite: 'lax'
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
    return res.status(401).json({ message: 'Unauthorized', error: err.message });
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
    }
    res.redirect('/dashboard');
  }
);

// =================== LOGOUT ===================
router.get('/logout', (req, res) => {
  // Clear cookies
  res.clearCookie('userId');
  res.clearCookie('username');
  
  req.logout(() => res.redirect('/'));
});

// =================== DELETE ACCOUNT ===================
router.delete('/delete-account', async (req, res) => {
  try {
    let userId;
    
    // First check if user is logged in via session
    if (req.isAuthenticated() && req.user) {
      userId = req.user._id;
    } 
    // If not, check JWT token
    else {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        return res.status(401).json({ message: 'No authentication token provided' });
      }
      
      const decoded = jwt.verify(token, SECRET);
      userId = decoded.id;
    }
    
    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ message: 'User not found' });

    await User.deleteOne({ _id: user._id });
    
    // Clear cookies
    res.clearCookie('userId');
    res.clearCookie('username');
    
    // Log out if using session auth
    if (req.isAuthenticated()) {
      req.logout(() => {});
    }
    
    res.status(200).json({ message: 'Account deleted successfully' });
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized', error: err.message });
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
    res.json({ isLoggedIn: false });
  }
});

router.get('/user-info', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      userId: req.user._id,
      username: req.user.username || req.user.displayName,
    });
  } else {
    res.status(401).json({ message: 'Unauthorized' });
  }
});

module.exports = router;