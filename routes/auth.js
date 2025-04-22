const express  = require('express');
const bcrypt   = require('bcryptjs');
const passport = require('../auth/passport');
const User     = require('../models/User');
const router   = express.Router();

// **Signup**
router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    // Check if the email is already taken
    if (await User.findOne({ email })) {
      return res.status(400).json({ message: 'Email already registered.' });
    }

    // Hash the password before saving
    const hash = await bcrypt.hash(password, 10);

    // Create a new user
    const newUser = await User.create({ username, email, password: hash });

    // Log the user in
    req.login(newUser, err => {
      if (err) throw err;
      res.status(201).json({ message: 'Signup successful', user: { id: newUser.id, username, email } });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// **Login**
router.post('/login',
  passport.authenticate('local-login', { // Use 'local-login' strategy here
    successRedirect: '/dashboard',
    failureRedirect: '/login.html',
    failureMessage: true
  }),
  (req, res) => {
    // If the authentication is successful, this block is executed
    res.json({ message: 'Login successful', user: { id: req.user.id, username: req.user.username, email: req.user.email } });
  }
);

// Update username
router.patch('/update-username', (req, res) => {
  const { newUsername } = req.body;

  // Ensure newUsername is provided
  if (!newUsername) {
    return res.status(400).json({ message: 'New username is required.' });
  }

  // Ensure the user is logged in
  if (!req.user) {
    return res.status(401).json({ message: 'You must be logged in to update your username.' });
  }

  // Update the username
  req.user.username = newUsername;
  req.user.save()
    .then(updatedUser => {
      res.status(200).json({ message: 'Username updated successfully', user: updatedUser });
    })
    .catch(err => res.status(500).json({ message: 'Server error', error: err }));
});



// **Google OAuth**
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => res.redirect('/dashboard')
);

// **GitHub OAuth**
router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));
router.get('/github/callback',
  passport.authenticate('github', { failureRedirect: '/' }),
  (req, res) => res.redirect('/dashboard')
);

// **LinkedIn OAuth**
router.get('/linkedin', passport.authenticate('linkedin-openid'));
router.get('/linkedin/callback',
  passport.authenticate('linkedin-openid', { failureRedirect: '/' }),
  (req, res) => res.redirect('/dashboard')
);

// **Logout**
router.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

module.exports = router;