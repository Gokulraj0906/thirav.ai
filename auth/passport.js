require('dotenv').config();
const passport = require('passport');
const bcrypt = require('bcryptjs');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const { Strategy: OIDCStrategy } = require('passport-openidconnect');
const User = require('../models/User'); // Assuming you have a User model

// Serialize user to store in session
passport.serializeUser((user, done) => done(null, user.id));

// Deserialize user to retrieve from session
passport.deserializeUser((id, done) => {
  User.findById(id)
    .then(user => done(null, user))
    .catch(err => done(err));
});

// **Sign Up Logic for LocalStrategy**: Handles user registration with email and password
passport.use('local-signup', new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password',
    passReqToCallback: true
  },
  (req, email, password, done) => {
    // Check if the email already exists in the database
    User.findOne({ email })
      .then(user => {
        if (user) {
          return done(null, false, { message: 'Email is already taken.' });
        }

        // Hash password before saving
        bcrypt.hash(password, 10, (err, hashedPassword) => {
          if (err) return done(err);

          // Create new user
          const newUser = new User({
            email,
            password: hashedPassword,
            username: email.split('@')[0],  // Using email prefix as username (or use custom logic)
            // Any other fields you want to add (like name, etc.)
          });

          newUser.save()
            .then(user => done(null, user))
            .catch(err => done(err));
        });
      })
      .catch(err => done(err));
  }
));

// **Login Logic for LocalStrategy**: Handles user login with email and password
passport.use('local-login', new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password',
    passReqToCallback: true
  },
  (req, email, password, done) => {
    User.findOne({ email })
      .then(user => {
        if (!user) {
          return done(null, false, { message: 'No account with that email.' });
        }
        bcrypt.compare(password, user.password)
          .then(isMatch => {
            if (!isMatch) {
              return done(null, false, { message: 'Incorrect password.' });
            }
            return done(null, user);
          })
          .catch(err => done(err));
      })
      .catch(err => done(err));
  }
));

// **Google OAuth Strategy**
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback'
  },
  (accessToken, refreshToken, profile, done) => {
    User.findOne({ googleId: profile.id })
      .then(user => {
        if (!user) {
          // If the user doesn't exist, create a new one
          const newUser = new User({
            googleId: profile.id,
            username: profile.displayName,
            email: profile.emails[0].value,
            // Password can be left undefined for OAuth users
          });
          newUser.save()
            .then(user => done(null, user))
            .catch(err => done(err));
        } else {
          return done(null, user);
        }
      })
      .catch(err => done(err));
  }
));

// **GitHub OAuth Strategy**
passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: '/auth/github/callback',
  scope: ['user:email']
},
  (accessToken, refreshToken, profile, done) => {
    console.log('Access Token:', accessToken);
    console.log('Refresh Token:', refreshToken);
    console.log('GitHub Profile:', profile);
    
    const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;

    if (!email) {
      return done(new Error('No email found for GitHub account.'));
    }

    // Proceed with finding or creating the user
    User.findOne({ githubId: profile.id })
      .then(user => {
        if (!user) {
          const newUser = new User({
            githubId: profile.id,
            username: profile.username,
            email: email,
          });
          newUser.save()
            .then(user => done(null, user))
            .catch(err => done(err));
        } else {
          return done(null, user);
        }
      })
      .catch(err => done(err));
  }
));

// **LinkedIn OAuth Strategy**
passport.use('linkedin-openid', new OIDCStrategy({
    issuer: 'https://www.linkedin.com',
    authorizationURL: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenURL: 'https://www.linkedin.com/oauth/v2/accessToken',
    userInfoURL: 'https://api.linkedin.com/v2/me',
    clientID: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    callbackURL: 'http://localhost:3000/auth/linkedin/callback',
    scope: ['openid', 'profile', 'email']
  },
  (issuer, sub, profile, accessToken, refreshToken, done) => {
    User.findOne({ linkedinId: profile.id })
      .then(user => {
        if (!user) {
          const newUser = new User({
            linkedinId: profile.id,
            username: profile.localizedFirstName,
            email: profile.emailAddress,
            // Password can be left undefined for OAuth users
          });
          newUser.save()
            .then(user => done(null, user))
            .catch(err => done(err));
        } else {
          return done(null, user);
        }
      })
      .catch(err => done(err));
  }
));

module.exports = passport;
