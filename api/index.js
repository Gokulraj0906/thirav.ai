// api/index.js

const express = require('express');
const serverless = require('serverless-http');
const session = require('express-session');
const passport = require('passport');
const mongoose = require('mongoose');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const YAML = require('yamljs');
const swaggerUi = require('swagger-ui-express');
require('dotenv').config();

require('../auth/passport');
const authenticateJWT = require('../auth/jwtMiddleware');

// Routes and Models
const authRoutes = require('../routes/auth');
const videoRoutes = require('../routes/video');
const courseRoutes = require('../routes/course');
const enrollmentRoutes = require('../routes/enrollment');
const progressRoutes = require('../routes/userProgress');
const swaggerDocument = YAML.load('./docs/swagger.yaml');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
}));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Session and Passport setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/auth', authRoutes);
app.use('/video', videoRoutes);
app.use('/course', courseRoutes);
app.use('/api/enrollment', enrollmentRoutes);
app.use('/api/progress', progressRoutes);


let conn = null;
async function connectDB() {
  if (conn == null) {
    conn = mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }).then(() => mongoose);
  }
  return conn;
}

app.get('/api/health', async (req, res) => {
  try {
    await connectDB();
    res.status(200).json({ status: 'OK' });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ status: 'ERROR', error: error.message });
  }
});

app.get('/', (req, res) => {
  res.send('API is running');
});

module.exports = async (req, res) => {
  await connectDB();
  const handler = serverless(app);
  return handler(req, res);
};

module.exports = app;