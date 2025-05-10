const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const UserProgress = require('../models/UserProgress');
const VideoProgress = require('../models/VideoProgress');


// Route to update video progress
router.post('/update', async (req, res) => {
  const { userId, courseId, videoId, completedMinutes, progress, totalProgress, totalMinutes } = req.body;

  // Validate user ID matches the authenticated user
  if (req.user._id.toString() !== userId) {
    return res.status(403).json({ error: 'Unauthorized access' });
  }

  try {
    // Input validation
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }

    // Handle overall course progress update
    if (totalProgress === true) {
      // Validate required fields
      if (!totalMinutes || totalMinutes <= 0) {
        return res.status(400).json({ error: 'Invalid total minutes' });
      }

      const completedMins = Math.max(0, Math.min(completedMinutes, totalMinutes));
      const progressPercent = Math.max(0, Math.min(progress, 100));

      const userProgress = await UserProgress.findOneAndUpdate(
        { userId, courseId },
        {
          $set: {
            completedMinutes: completedMins,
            totalMinutes: totalMinutes,
            progress: progressPercent
          }
        },
        { new: true, upsert: true }
      );

      return res.json({ message: 'Course progress updated', progress: userProgress });
    }

    // Handle individual video progress update
    if (videoId) {
      // Validate video ID
      if (!videoId || typeof videoId !== 'string' || videoId.trim() === '') {
        return res.status(400).json({ error: 'Invalid video ID' });
      }

      // Validate numeric fields
      if (typeof completedMinutes !== 'number' || completedMinutes < 0) {
        return res.status(400).json({ error: 'Invalid completed minutes' });
      }

      if (typeof progress !== 'number' || progress < 0 || progress > 100) {
        return res.status(400).json({ error: 'Invalid progress percentage' });
      }

      // Timestamp for last watched
      const lastWatched = new Date();

      const videoProgress = await VideoProgress.findOneAndUpdate(
        { userId, courseId, videoId },
        {
          $set: {
            completedMinutes,
            progress,
            lastWatched
          }
        },
        { new: true, upsert: true }
      );

      // Update the main progress record
      await updateOverallProgress(userId, courseId);

      return res.json({ message: 'Video progress updated', progress: videoProgress });
    }

    res.status(400).json({ error: 'Invalid request - missing required parameters' });
  } catch (err) {
    console.error('Error updating progress:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Route to reset progress for a specific video
router.post('/reset-video', async (req, res) => {
  const { userId, courseId, videoId } = req.body;

  // Validate user ID matches the authenticated user
  if (req.user._id.toString() !== userId) {
    return res.status(403).json({ error: 'Unauthorized access' });
  }

  try {
    // Input validation
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }

    if (!videoId) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }

    // Reset the video progress
    await VideoProgress.findOneAndUpdate(
      { userId, courseId, videoId },
      { $set: { completedMinutes: 0, progress: 0 } }
    );

    // Update overall progress
    await updateOverallProgress(userId, courseId);

    res.json({ message: 'Video progress reset successfully' });
  } catch (err) {
    console.error('Error resetting video progress:', err);
    res.status(500).json({ error: 'Failed to reset video progress' });
  }
});

// Route to get progress data
router.get('/get', async (req, res) => {
  const { userId, courseId } = req.query;

  // Validate user ID matches the authenticated user
  if (req.user._id.toString() !== userId) {
    return res.status(403).json({ error: 'Unauthorized access' });
  }

  try {
    // Input validation
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }

    // Get the overall progress
    const progress = await UserProgress.findOne({ userId, courseId });

    // Get individual video progress
    const videoProgress = await VideoProgress.find({ userId, courseId });

    res.json({
      progress: progress ? progress.progress : 0,
      completedMinutes: progress ? progress.completedMinutes : 0,
      totalMinutes: progress ? progress.totalMinutes : 0,
      status: progress ? progress.status : 'in progress',
      videoProgress
    });
  } catch (err) {
    console.error('Error getting progress:', err);
    res.status(500).json({ error: 'Failed to get progress' });
  }
});

// Backward compatibility for the older update-progress route
router.post('/update-progress', async (req, res) => {
  const { userId, courseId, watchedMinutes } = req.body;

  // Validate user ID matches the authenticated user
  if (req.user._id.toString() !== userId) {
    return res.status(403).json({ error: 'Unauthorized access' });
  }

  try {
    // Input validation
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }

    if (typeof watchedMinutes !== 'number' || watchedMinutes < 0) {
      return res.status(400).json({ error: 'Invalid watched minutes' });
    }

    // Find the progress record for the user and course
    const progress = await UserProgress.findOne({ userId, courseId });
    if (!progress) {
      return res.status(404).json({ error: 'Progress record not found' });
    }

    // Ensure watchedMinutes doesn't exceed totalMinutes
    const validWatchedMinutes = Math.min(watchedMinutes, progress.totalMinutes);

    // Add watchedMinutes to completedMinutes, but not exceeding totalMinutes
    progress.completedMinutes = Math.min(
      progress.completedMinutes + validWatchedMinutes,
      progress.totalMinutes
    );

    // Calculate progress as a percentage of totalMinutes
    progress.progress = Math.round((progress.completedMinutes / progress.totalMinutes) * 100);

    // Save the updated progress
    await progress.save();

    res.json({ message: 'Progress updated', progress });
  } catch (err) {
    console.error('Error updating progress:', err);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

// Helper function to update overall progress based on video progress
async function updateOverallProgress(userId, courseId) {
  try {
    // Get all video progress for this course and user
    const videoProgressRecords = await VideoProgress.find({ userId, courseId });

    // Get the course details to get total minutes
    const userProgress = await UserProgress.findOne({ userId, courseId });
    if (!userProgress) {
      console.error('User progress record not found for course:', courseId);
      return;
    }

    // Calculate the overall completed minutes
    let totalCompletedMinutes = 0;
    let totalWatchedWeight = 0;

    videoProgressRecords.forEach(record => {
      const videoWeight = record.completedMinutes / (record.progress / 100); // Estimate total video minutes
      if (videoWeight > 0) {
        totalWatchedWeight += videoWeight;
        totalCompletedMinutes += record.completedMinutes || 0;
      }
    });

    // If we have no valid video progress, use the existing total
    if (totalWatchedWeight === 0 || videoProgressRecords.length === 0) {
      return;
    }

    // Ensure we don't exceed total minutes
    totalCompletedMinutes = Math.min(totalCompletedMinutes, userProgress.totalMinutes);

    // Calculate overall progress percentage
    const overallProgress = Math.round((totalCompletedMinutes / userProgress.totalMinutes) * 100);

    // Update the user progress record
    userProgress.completedMinutes = totalCompletedMinutes;
    userProgress.progress = overallProgress;
    await userProgress.save();
  } catch (err) {
    console.error('Error updating overall progress:', err);
  }
}

module.exports = router;