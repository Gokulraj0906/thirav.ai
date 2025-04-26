require('dotenv').config();
const express  = require('express');
const session  = require('express-session');
const passport = require('passport');
const mongoose = require('mongoose');
require('./auth/passport');
const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/video');


const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());



app.use(express.static('public'));

app.use((req, res, next) => {
  console.log(`Incoming Request: ${req.method} ${req.url}`);
  next();
});

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

app.use('/auth', authRoutes);

app.get('/', (req, res) => {
  res.send(`
    <h1>Welcome to thirav.ai</h1>
    <p>
      <a href="/auth/google">Login with Google</a><br>
      <a href="/auth/github">Login with GitHub</a><br>
      <a href="/auth/linkedin">Login with LinkedIn</a><br>
      <a href="/login.html">Login with Email</a><br>
      <a href="/signup.html">Sign Up</a>
    </p>
  `);
});

function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/');
}

app.get('/dashboard', ensureAuth, (req, res) => {
  const name = req.user.username || req.user.displayName;
  res.send(`<h1>Dashboard</h1><p>Hello, ${name}!</p><p><a href="/auth/logout">Logout</a></p>`);
});


app.use('/video', videoRoutes);

app.use('/uploads', express.static('uploads'));


mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
