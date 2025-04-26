const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Video = require('../models/Video');

// Set storage for multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Save files inside uploads/
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname)); // Save with unique filename
  }
});

const upload = multer({ storage: storage });

// ---- NEW Upload route ----
router.post('/upload', upload.single('video'), async (req, res) => {
  try {
    const { title, description } = req.body;
    const fileUrl = `/uploads/${req.file.filename}`; // Path to access the uploaded file

    const newVideo = new Video({
      title,
      description,
      url: fileUrl
    });

    await newVideo.save();

    res.status(201).json({ message: 'Video uploaded successfully', video: newVideo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err });
  }
});


// Your old update route
router.patch('/update/:id', async (req, res) => {
  const { title, description, url } = req.body;
  const { id } = req.params;

  try {
    const updatedVideo = await Video.findByIdAndUpdate(
      id,
      { title, description, url },
      { new: true }
    );

    if (!updatedVideo) {
      return res.status(404).json({ message: 'Video not found.' });
    }

    res.status(200).json({ message: 'Video updated successfully', video: updatedVideo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err });
  }
});

module.exports = router;