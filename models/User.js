const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true
  },
  username: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: function() {
      return this.googleId == null && this.githubId == null && this.linkedinId == null; // Only require password if not OAuth
    }
  },
  googleId: String,
  githubId: String,
  linkedinId: String,
});

const User = mongoose.model('User', userSchema);

module.exports = User;
