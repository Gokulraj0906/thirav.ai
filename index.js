require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const mongoose = require('mongoose');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

const adminRoutes = require('./routes/adminProgress');
const authRoutes = require('./routes/auth');
const courseRoutes = require('./routes/course');
const enrollmentRoutes = require('./routes/enrollment');
const progressRoutes = require('./routes/userProgress');
const paymentRoutes = require('./routes/payment');

require('./auth/passport'); // Passport config

const swaggerDocument = YAML.load('./docs/swagger.yaml');

const app = express();

// Middleware setup
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(cors({
  origin: 'http://localhost:3001',
  credentials: true,
}));

app.use(cookieParser());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Swagger docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Request logging
app.use((req, res, next) => {
  console.log(`Incoming Request: ${req.method} ${req.url}`);
  next();
});

// Session setup (for Passport OAuth or session auth)
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
  }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Set user cookies after authentication
app.use((req, res, next) => {
  if (req.user) {
    const name = req.user.username || req.user.displayName;
    const userId = req.user._id;
    res.cookie('userId', userId, { maxAge: 86400000, httpOnly: false, sameSite: 'lax' });
    res.cookie('username', name, { maxAge: 86400000, httpOnly: false, sameSite: 'lax' });
  }
  next();
});

// Routes
app.use('/auth', authRoutes);
app.use('/course', courseRoutes);
app.use('/api/enrollment', enrollmentRoutes);
app.use('/api/progress', progressRoutes);
app.use('/admin', adminRoutes);
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));
app.use('/payment', paymentRoutes);

// Public homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/home.html'));
});

// Authentication middleware helper
function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ message: 'Unauthorized' });
}

// Protected dashboard route
app.get('/dashboard', ensureAuth, (req, res) => {
  const name = req.user.username || req.user.displayName;
  const userId = req.user._id;

  res.json({ userId, username: name });
});

// Check login status
app.get('/isLoggedIn', (req, res) => {
  if (req.isAuthenticated() && req.user) {
    const name = req.user.username || req.user.displayName;
    const userId = req.user._id;

    res.json({
      isLoggedIn: true,
      userId,
      username: name
    });
  } else {
    res.json({ isLoggedIn: false });
  }
});

// Logout route
app.get('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.clearCookie('userId');
    res.clearCookie('username');
    res.redirect('/');
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Connect to MongoDB and start server
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log(`Swagger docs available at http://localhost:${PORT}/api-docs`);
    });
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));