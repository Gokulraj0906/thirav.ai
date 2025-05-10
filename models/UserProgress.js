// UserProgress.js
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
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, { 
  timestamps: true 
});

// Create a compound index for faster queries
userProgressSchema.index({ userId: 1, courseId: 1 }, { unique: true });

// Pre-save hook to update status based on progress
userProgressSchema.pre('save', function (next) {
  // Update status based on progress
  if (this.completedMinutes >= this.totalMinutes) {
    this.status = 'completed';
    this.completedMinutes = this.totalMinutes; // Ensure we don't exceed total minutes
    this.progress = 100; // Ensure 100% progress
  } else if (this.completedMinutes > 0) {
    this.status = 'in progress';
  } else {
    this.status = 'not started';
  }
  
  // Update lastUpdated timestamp
  this.lastUpdated = new Date();
  
  next();
});

module.exports = mongoose.model('UserProgress', userProgressSchema);