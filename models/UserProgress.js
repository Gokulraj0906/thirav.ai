const mongoose = require('mongoose');

const userProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  completedMinutes: { type: Number, default: 0 },
  totalMinutes: { type: Number },
  progress: { type: Number, default: 0 },
  status: { type: String, enum: ['in progress', 'completed'], default: 'in progress' }
});

userProgressSchema.pre('save', function (next) {
  this.status = this.completedMinutes >= this.totalMinutes ? 'completed' : 'in progress';
  next();
});

module.exports = mongoose.model('UserProgress', userProgressSchema);
