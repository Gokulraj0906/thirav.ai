require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

const adminRoutes = require('./routes/adminProgress');
const authRoutes = require('./routes/auth');
const courseRoutes = require('./routes/course');
const enrollmentRoutes = require('./routes/enrollment');
const progressRoutes = require('./routes/userProgress');
const paymentRoutes = require('./routes/payment');

const authenticateJWT = require('./middleware/auth'); // JWT middleware
const certificateRoutes = require('./routes/certificateRoutes'); // Certificate routes


const swaggerDocument = YAML.load('./docs/swagger.yaml');
const app = express();

// Middleware setup
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.set('trust proxy', 1);
// CORS configuration for JWT-based API
app.use(cors({
  origin: ['http://localhost:5173', 'http://192.168.1.7:3001'],
  credentials: true,
}));

// Static files
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`Incoming Request: ${req.method} ${req.url}`);
  next();
});

// Public routes (no authentication required)
app.use('/auth', authRoutes); // Login/Signup returns JWT
app.use('/course', courseRoutes);

// Protected routes (JWT authentication required)
app.use('/api/enrollment', authenticateJWT, enrollmentRoutes);
app.use('/api/progress', authenticateJWT, progressRoutes);
app.use('/admin', authenticateJWT, adminRoutes);
app.use('/payment', authenticateJWT, paymentRoutes);
app.use('/certificates', authenticateJWT, certificateRoutes);

// Public homepage
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Server Status</title>
        <style>
          body {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f4f4f4;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div>
          <h1>Server's running. We don’t know how, but we’re not touching it.</h1>
        </div>
      </body>
    </html>
  `);
});

// Protected dashboard route
app.get('/dashboard', authenticateJWT, (req, res) => {
  res.json({
    userId: req.user._id,
    username: req.user.username || req.user.displayName,
    email: req.user.email
  });
});

// JWT-based authentication check endpoint
app.get('/auth/check', authenticateJWT, (req, res) => {
  res.json({
    isLoggedIn: true,
    userId: req.user._id,
    username: req.user.username || req.user.displayName,
    email: req.user.email
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
  .catch(err => console.error('MongoDB connection error:', err));
