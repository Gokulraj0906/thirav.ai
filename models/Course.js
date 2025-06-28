// const mongoose = require('mongoose');

// const VideoSchema = new mongoose.Schema({
//   title: { type: String, required: true, trim: true },
//   description: { type: String, trim: true },
//   url: { type: String, required: true },
//   duration: { type: Number, min: 0 }
// });

// const SectionSchema = new mongoose.Schema({
//   sectionTitle: {
//     type: String,
//     required: true,
//     trim: true
//   },
//   videos: [VideoSchema]
// });

// const CourseSchema = new mongoose.Schema({
//   title: { 
//     type: String, 
//     required: true,
//     trim: true
//   },
//   description: String,
//   sections: [SectionSchema],
//   totalMinutes: { type: Number, default: 0 },
//   price: {
//     type: Number,
//     required: true,
//     min: [0, 'Price cannot be negative']
//   }
// }, { timestamps: true });

// module.exports = mongoose.model('Course', CourseSchema);

const mongoose = require('mongoose');

const VideoSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  url: { type: String, required: true },
  duration: { type: Number, min: 0 }
});

const SectionSchema = new mongoose.Schema({
  sectionTitle: { type: String, required: true, trim: true },
  videos: [VideoSchema]
});

const CourseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: String,
  sections: [SectionSchema],
  totalMinutes: { type: Number, default: 0 },
  price: { type: Number, required: true, min: [0, 'Price cannot be negative'] },
  thumbnailUrl: { type: String, default: '' } // ✅ NEW FIELD
}, { timestamps: true });

module.exports = mongoose.model('Course', CourseSchema);
