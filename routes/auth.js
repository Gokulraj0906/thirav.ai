const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const passport = require('../auth/passport');
const authenticateJWT = require('../middleware/auth');
const authorizeAdmin = require('../middleware/authorizeAdmin');

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

    // Generate JWT token
    const token = generateToken(newUser);
    
    res.status(201).json({
      message: 'Signup successful',
      token,
      user: { 
        id: newUser._id, 
        username: newUser.username, 
        email: newUser.email 
      }
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
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || req.query;
    
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    
    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    
    // Generate JWT token
    const token = generateToken(user);
    
    // Return the token and user info
    res.status(200).json({
      message: 'Login successful',
      token,
      user: { 
        id: user._id, 
        username: user.username, 
        email: user.email 
      }
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// =================== PROTECTED ROUTE TEST ===================
router.get('/protected-test', async (req, res) => {
  try {
    // Get the token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization header missing or invalid' });
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Token not provided' });
    }
    
    // Verify the token
    const decoded = jwt.verify(token, SECRET);
    
    // Find the user
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    res.json({ 
      message: 'You are authenticated!',
      user: { id: user._id, username: user.username, email: user.email }
    });
  } catch (err) {
    console.error('Protected route error:', err);
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// =================== UPDATE USERNAME ===================
router.patch('/update-username', async (req, res) => {
  try {
    // Get the token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization header missing or invalid' });
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Token not provided' });
    }
    
    // Verify the token
    const decoded = jwt.verify(token, SECRET);
    
    // Find and update the user
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    const { newUsername } = req.body;
    if (!newUsername) {
      return res.status(400).json({ message: 'New username is required.' });
    }
    
    user.username = newUsername;
    const updatedUser = await user.save();
    
    // Generate new token with updated info
    const newToken = generateToken(updatedUser);
    
    res.status(200).json({ 
      message: 'Username updated successfully', 
      token: newToken,
      user: { 
        id: updatedUser._id, 
        username: updatedUser.username, 
        email: updatedUser.email 
      } 
    });
  } catch (err) {
    console.error('Update username error:', err);
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// =================== DELETE ACCOUNT ===================
router.delete('/delete-account', async (req, res) => {
  try {
    // Get the token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization header missing or invalid' });
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Token not provided' });
    }
    
    // Verify the token
    const decoded = jwt.verify(token, SECRET);
    
    // Find and delete the user
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    await User.deleteOne({ _id: user._id });
    res.status(200).json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('Delete account error:', err);
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Store password reset tokens with their expiration
const resetTokenStore = new Map();

// =================== REQUEST PASSWORD RESET ===================
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    // Check if user with this email exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'No account found with that email address.' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetCode = generateOTP(); // 6-digit code for user to enter
    
    // Store token and code with expiration (1 hour)
    resetTokenStore.set(resetToken, {
      email,
      code: resetCode,
      expiresAt: Date.now() + 60 * 60 * 1000 // 1 hour
    });

    // For development, log reset code to console
    if (DEV_MODE) {
      console.log('DEV MODE - Generated Reset Code:', resetCode, 'for email:', email);
      console.log('DEV MODE - Reset Token:', resetToken);
    }

    // Skip email sending only if transporter is not available
    if (!transporter) {
      return res.status(200).json({ 
        message: 'Reset instructions generated successfully (check server console for code)',
        resetToken,
        ...(DEV_MODE && { devResetCode: resetCode }) // Include code in response for dev mode only
      });
    }

    // Send email with reset instructions
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: email,
        subject: 'Password Reset - thirav.ai',
        html: `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset</title>
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
              .reset-code {
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
                <h1>Password Reset</h1>
              </div>
              <div class="email-body">
                <p>Hello,</p>
                <p>We received a request to reset your password for your thirav.ai account. Please use the verification code below:</p>
                
                <div class="reset-code">${resetCode}</div>
                
                <p>Enter this code on the password reset page.</p>
                <p class="expiry-notice">This code will expire in 1 hour for security reasons.</p>
                <p>If you did not request this password reset, please ignore this email or contact support if you have concerns.</p>
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
      console.log('Password reset email sent successfully to', email);
      
      res.status(200).json({ 
        message: 'Password reset instructions sent to your email.',
        resetToken,
        ...(DEV_MODE && { devResetCode: resetCode }) // Include code in response for dev mode only
      });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      
      // If email sending fails but we're in dev mode, still return success with reset code
      if (DEV_MODE) {
        return res.status(200).json({ 
          message: 'Generated reset code but email sending failed. Check server logs.',
          resetToken,
          devResetCode: resetCode
        });
      } else {
        return res.status(500).json({ message: 'Failed to send password reset email' });
      }
    }
  } catch (err) {
    console.error('Password Reset Error:', err);
    res.status(500).json({ message: 'Failed to process password reset request', error: err.message });
  }
});

// =================== VERIFY RESET CODE & SET NEW PASSWORD ===================
router.post('/reset-password', async (req, res) => {
  const { resetToken, resetCode, newPassword } = req.body;

  try {
    // Validate reset token and code
    const resetData = resetTokenStore.get(resetToken);
    
    if (!resetData) {
      return res.status(400).json({ message: 'Invalid or expired reset token. Please request a new password reset.' });
    }

    if (resetData.expiresAt < Date.now()) {
      // Clean up expired token
      resetTokenStore.delete(resetToken);
      return res.status(400).json({ message: 'Reset token expired. Please request a new password reset.' });
    }

    if (resetData.code !== resetCode) {
      return res.status(400).json({ message: 'Invalid reset code. Please try again.' });
    }

    // Token and code are valid, update the user's password
    const user = await User.findOne({ email: resetData.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Hash the new password
    const hash = await bcrypt.hash(newPassword, 10);
    user.password = hash;
    await user.save();

    // Clean up used reset token
    resetTokenStore.delete(resetToken);

    // Generate JWT token for auto-login
    const token = generateToken(user);
    
    res.status(200).json({
      message: 'Password reset successful',
      token,
      user: { 
        id: user._id, 
        username: user.username, 
        email: user.email 
      }
    });
  } catch (err) {
    console.error('Password Reset Error:', err);
    res.status(500).json({ message: 'Failed to reset password', error: err.message });
  }
});

//Google OAuth Routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', passport.authenticate('google', { session: false }), (req, res) => {
  const token = jwt.sign({ id: req.user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.redirect(`${process.env.CLIENT_URL}/oauth-success?token=${token}`);
});

// GitHub OAuth Routes
router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));

router.get('/github/callback', passport.authenticate('github', { session: false }), (req, res) => {
  const token = jwt.sign({ id: req.user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.redirect(`${process.env.CLIENT_URL}/oauth-success?token=${token}`);
});

router.get('/all-users', authenticateJWT, authorizeAdmin, async (req, res) => {
  try {
    const users = await User.find({}, '-password'); // exclude passwords
    const totalUsers = await User.countDocuments(); // get count

    res.status(200).json({
      total: totalUsers,
      users
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
