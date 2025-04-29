const mongoose = require('mongoose');

const VideoSchema = new mongoose.Schema({
  title: String,
  description: String,
  url: String,
  duration: Number
});

const CourseSchema = new mongoose.Schema({
  title: String,
  description: String,
  videos: [VideoSchema],
  totalMinutes: Number
});

module.exports = mongoose.model('Course', CourseSchema);
