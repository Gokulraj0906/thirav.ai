require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
require('./auth/passport');

const app = express();

app.use(session({ secret: "secret", resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

app.use('/auth', require('./routes/auth'));

app.get('/', (req, res) => res.send('Home Page'));
app.get('/dashboard', (req, res) => {
  if (req.isAuthenticated()) {
    res.send(`Welcome ${req.user.displayName}`);
  } else {
    res.redirect('/');
  }
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
