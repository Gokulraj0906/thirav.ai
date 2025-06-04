// models/Certificate.js
const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
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
  certificateNumber: {
    type: String,
    unique: true,
    index: true
    // Remove required: true to let pre-save middleware handle it
  },
  studentName: {
    type: String,
    required: true,
    trim: true
  },
  courseTitle: {
    type: String,
    required: true,
    trim: true
  },
  completionDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  totalCourseDuration: {
    type: Number,
    required: true,
    min: 0
  },
  finalScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 100
  },
  certificateUrl: {
    type: String, // URL to the generated certificate PDF/image
    trim: true
  },
  isValid: {
    type: Boolean,
    default: true
  },
  verificationCode: {
    type: String,
    unique: true,
    index: true
    // Remove required: true to let pre-save middleware handle it
  },
  issueDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient querying
certificateSchema.index({ userId: 1, courseId: 1 }, { unique: true });

// Generate certificate number and verification code
certificateSchema.pre('save', async function(next) {
  try {
    if (!this.certificateNumber) {
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      const count = await this.constructor.countDocuments({
        createdAt: {
          $gte: new Date(year, new Date().getMonth(), 1),
          $lt: new Date(year, new Date().getMonth() + 1, 1)
        }
      });
      this.certificateNumber = `CERT-${year}${month}-${String(count + 1).padStart(4, '0')}`;
    }
    
    if (!this.verificationCode) {
      const crypto = require('crypto');
      this.verificationCode = crypto.randomBytes(16).toString('hex').toUpperCase();
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('Certificate', certificateSchema);