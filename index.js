require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const mongoose = require('mongoose');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const UserProgress = require('./models/UserProgress');
const User = require('./models/User');
const Course = require('./models/Course');
const Enrollment = require('./models/Enrollment');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');


require('./auth/passport');         // Passport config
const authenticateJWT = require('./auth/jwtMiddleware');  // JWT middleware

const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/video');
const courseRoutes = require('./routes/course');
const enrollmentRoutes = require('./routes/enrollment');
const progressRoutes = require('./routes/userProgress');     // your progress router
const swaggerDocument = YAML.load('./docs/swagger.yaml'); // Path to your YAML file

const app = express();

app.use(cors({
  origin: 'http://localhost:3001',
  credentials: true,
}));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

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
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));

// Serve the admin progress page
app.get('/admin-progress', (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/auth/login?redirect=/admin-progress');
  }
  next();
}, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin/admin-progress.html'));
});

// Admin API endpoint for progress data
app.get('/admin/progress-review', (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}, async (req, res) => {
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

// Admin API endpoint for granting access
app.post('/admin/grant-access', (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}, async (req, res) => {
  const { email, courseName } = req.body;
  
  try {
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
    
    return res.json({
      message: 'Access granted successfully.'
    });
  } catch (err) {
    console.error('Error granting access:', err);
    res.status(500).json({ error: 'Error granting access' });
  }
});

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


app.get('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.clearCookie('userId');
    res.clearCookie('username');
    res.redirect('/');
  });
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
    console.log(`Swagger docs available at http://localhost:${PORT}/api-docs`);
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));
