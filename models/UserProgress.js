const mongoose = require('mongoose');

const userProgressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
    index: true
  },
  completedMinutes: {
    type: Number,
    default: 0,
    min: 0
  },
  totalMinutes: {
    type: Number,
    required: true,
    min: 0
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  status: {
    type: String,
    enum: ['not started', 'in progress', 'completed'],
    default: 'not started'
  },
  faceSimilarityScore: {
  type: Number,
  min: 0,
  max: 1
},
faceNotFound: {
  type: Boolean,
  default: false
},
lastUpdated: {
  type: Date,
  default: Date.now
  }
});

module.exports = mongoose.model('UserProgress', userProgressSchema);
