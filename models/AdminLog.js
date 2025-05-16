const mongoose = require('mongoose');

const AdminLogSchema = new mongoose.Schema({
  actionType: {
    type: String,
    required: true,
    enum: [
      'AUTH_SUCCESS',
      'AUTH_FAILURE',
      'API_ACTION',
      'EMAIL_SENT',
      'EMAIL_FAILED',
      'COURSE_ACCESS_GRANTED'
    ]
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  details: {
    type: String,
    required: true
  },
  ipAddress: {
    type: String,
    default: 'N/A'
  },
  userAgent: {
    type: String,
    default: 'N/A'
  },
  requestBody: {
    type: String,
    default: ''
  },
  responseStatus: {
    type: Number,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('AdminLog', AdminLogSchema);