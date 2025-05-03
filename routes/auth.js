const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const passport = require('../auth/passport');
const router = express.Router();

require('dotenv').config();
const SECRET = process.env.JWT_SECRET;

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

// =================== SIGNUP ===================
router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    if (await User.findOne({ email })) {
      return res.status(400).json({ message: 'Email already registered.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const newUser = await User.create({ username, email, password: hash });

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
    console.error(err);
    res.status(500).json({ message: 'Server error' });
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