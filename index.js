require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const mongoose = require('mongoose');
const path = require('path');
require('./auth/passport'); // Passport config
const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/video');
const courseRoutes = require('./routes/course');
const cors = require('cors');
const app = express();

app.use(cors());

// Middleware with increased limits for video uploads
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use((req, res, next) => {
  console.log(`Incoming Request: ${req.method} ${req.url}`);
  next();
});

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/auth', authRoutes);
app.use('/video', videoRoutes);
app.use('/course', courseRoutes);  // Keep only this one

// Home route
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/home.html');
});

// Authentication check middleware
function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/');
}

// Dashboard (protected route)
app.get('/dashboard', ensureAuth, (req, res) => {
  const name = req.user.username || req.user.displayName;
  res.send(`
    <h1>Dashboard</h1>
    <p>Hello, ${name}!</p>
    <p><a href="/auth/logout">Logout</a></p>
  `);
});

// Check login status
app.get('/isLoggedIn', (req, res) => {
  res.json({ isLoggedIn: req.isAuthenticated() });
});

// Logout
app.get('/logout', (req, res, next) => {
  req.logout(function (err) {
    if (err) { return next(err); }
    res.redirect('/');
  });
});

const Course = require('./models/Course'); // Adjust this path to your actual Course model

app.get('/course/details/by-title/:title', async (req, res) => {
  try {
    const title = req.params.title;
    const course = await Course.findOne({ title: new RegExp(title, 'i') }); // Case-insensitive search

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    res.json(course); // Send the course data
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    // Start server only after DB connected
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
  });