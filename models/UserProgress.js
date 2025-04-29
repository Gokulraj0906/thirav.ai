const mongoose = require('mongoose');

const userProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  completedMinutes: { type: Number, default: 0 },
  totalMinutes: { type: Number },
  progress: { type: Number, default: 0 }
});

module.exports = mongoose.model('UserProgress', userProgressSchema);