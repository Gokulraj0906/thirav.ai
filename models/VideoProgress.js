
// VideoProgress.js
const mongoose = require('mongoose');

const VideoProgressSchema = new mongoose.Schema({
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
  videoId: {
    type: String,
    required: true
  },
  completedMinutes: {
    type: Number,
    default: 0,
    min: 0
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  lastWatched: {
    type: Date,
    default: Date.now
  },
  watchHistory: {
    type: [{
      timestamp: Date,
      minutesWatched: Number,
      progressValue: Number
    }],
    default: []
  }
}, { 
  timestamps: true 
});

// Create compound index for faster queries
VideoProgressSchema.index({ userId: 1, courseId: 1, videoId: 1 }, { unique: true });

// Pre-save hook to update lastWatched
VideoProgressSchema.pre('save', function(next) {
  // Update the lastWatched timestamp
  this.lastWatched = new Date();
  
  // Add entry to watchHistory if there's significant progress change
  const lastEntry = this.watchHistory.length > 0 ? 
    this.watchHistory[this.watchHistory.length - 1] : null;
    
  // Only add new entry if progress changed significantly (more than 5%)
  if (!lastEntry || Math.abs(this.progress - lastEntry.progressValue) >= 5) {
    this.watchHistory.push({
      timestamp: new Date(),
      minutesWatched: this.completedMinutes,
      progressValue: this.progress
    });
    
    // Limit history to prevent excessive growth
    if (this.watchHistory.length > 50) {
      this.watchHistory.shift(); // Remove oldest entry
    }
  }
  
  next();
});

module.exports = mongoose.model('VideoProgress', VideoProgressSchema);