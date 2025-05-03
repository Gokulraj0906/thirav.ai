const express = require('express');
const router = express.Router();
const UserProgress = require('../models/UserProgress');

// Route to update progress
router.post('/update-progress', async (req, res) => {
  const { userId, courseId, watchedMinutes } = req.body;

  try {
    // Find the progress record for the user and course
    const progress = await UserProgress.findOne({ userId, courseId });
    if (!progress) {
      return res.status(404).json({ error: 'Progress record not found' });
    }

    // Ensure watchedMinutes doesn't exceed totalMinutes
    if (watchedMinutes > progress.totalMinutes) {
      return res.status(400).json({ error: 'Watched minutes cannot exceed total course duration' });
    }

    // Add watchedMinutes to completedMinutes, but ensure it doesn't exceed totalMinutes
    progress.completedMinutes = Math.min(progress.completedMinutes + watchedMinutes, progress.totalMinutes);

    // Calculate progress as a percentage of totalMinutes
    progress.progress = Math.round((progress.completedMinutes / progress.totalMinutes) * 100);

    // Save the updated progress
    await progress.save();

    res.json({ message: 'Progress updated', progress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

module.exports = router;
