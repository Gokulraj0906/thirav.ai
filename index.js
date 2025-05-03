require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const mongoose = require('mongoose');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const adminRoutes = require('./routes/adminProgress');




require('./auth/passport');         // Passport config
const authenticateJWT = require('./auth/jwtMiddleware');  // JWT middleware

const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/video');
const courseRoutes = require('./routes/course');
const enrollmentRoutes = require('./routes/enrollment'); // your enrollment router
const progressRoutes = require('./routes/userProgress');     // your progress router

const app = express();

app.use(cors({
  origin: 'http://localhost:3001',
  credentials: true,
}));

app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use((req, res, next) => {
  console.log(`Incoming Request: ${req.method} ${req.url}`);
  next();
});

// Session (for Passport OAuth, optional if only using JWT)
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
  }
}));

// Passport (only needed if using session-based OAuth)
app.use(passport.initialize());
app.use(passport.session());

// After login (session or OAuth), set non-httpOnly cookies for userId & username
app.use((req, res, next) => {
  if (req.user) {
    const name = req.user.username || req.user.displayName;
    const userId = req.user._id;
    res.cookie('userId', userId, { maxAge: 86400000, httpOnly: false, sameSite: 'lax' });
    res.cookie('username', name,   { maxAge: 86400000, httpOnly: false, sameSite: 'lax' });
  }
  next();
});

// Routes
app.use('/auth', authRoutes);
app.use('/video', videoRoutes);
app.use('/course', courseRoutes);
app.use('/api/enrollment', enrollmentRoutes);
app.use('/api/progress', progressRoutes);
app.use('/admin', adminRoutes);
// Home
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/home.html'));
});

function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ message: 'Unauthorized' });
}

// Dashboard (protected route)
app.get('/dashboard', ensureAuth, (req, res) => {
  const name = req.user.username || req.user.displayName;
  const userId = req.user._id;

  res.json({
    userId: userId,
    username: name
  });
});

app.get('/isLoggedIn', (req, res) => {
  if (req.isAuthenticated() && req.user) {
    const name = req.user.username || req.user.displayName;
    const userId = req.user._id;
    
    res.json({ 
      isLoggedIn: true,
      userId: userId,
      username: name 
    });
  } else {
    res.json({ isLoggedIn: false });
  }
});

// Logout (if using session-based)
app.get('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.clearCookie('userId');
    res.clearCookie('username');
    res.redirect('/');
  });
});

// Mongo and server
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));
