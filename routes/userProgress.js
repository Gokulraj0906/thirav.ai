const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const UserProgress = require('../models/UserProgress');
const VideoProgress = require('../models/VideoProgress');

async function updateOverallProgress(userId, courseId) {
  try {
    const videoProgressRecords = await VideoProgress.find({ userId, courseId });
    const userProgress = await UserProgress.findOne({ userId, courseId });

    if (!userProgress || videoProgressRecords.length === 0) return;

    let totalCompleted = 0;

    videoProgressRecords.forEach(({ completedMinutes }) => {
      totalCompleted += completedMinutes || 0;
    });

    totalCompleted = Math.min(totalCompleted, userProgress.totalMinutes);
    const progressPercent = Math.round((totalCompleted / userProgress.totalMinutes) * 100);

    userProgress.completedMinutes = totalCompleted;
    userProgress.progress = progressPercent;
    userProgress.status = progressPercent === 100 ? 'completed' : progressPercent > 0 ? 'in progress' : 'not started';
    userProgress.lastUpdated = new Date();

    await userProgress.save();
  } catch (err) {
    console.error('Error updating overall progress:', err);
  }
}

// Update course or video progress
router.post('/update', async (req, res) => {
  const cookieUserId = req.cookies.userId;  // userId from cookie
  const {
    userId,
    courseId,
    videoId,
    completedMinutes,
    progress,
    totalProgress,
    totalMinutes,
    watchedMinutes,  // new: amount to increment completedMinutes
  } = req.body;

  if (!cookieUserId) {
    return res.status(403).json({ error: 'Unauthorized access: No user ID cookie' });
  }

  if (cookieUserId !== userId) {
    return res.status(403).json({ error: 'Unauthorized access: User ID mismatch' });
  }

  try {
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ error: 'Invalid user or course ID' });
    }

    // 1) Handle incrementing course completedMinutes by watchedMinutes
    if (typeof watchedMinutes === 'number') {
      if (watchedMinutes < 0) {
        return res.status(400).json({ error: 'watchedMinutes cannot be negative' });
      }

      const userProgress = await UserProgress.findOne({ userId, courseId });
      if (!userProgress) {
        return res.status(404).json({ error: 'User progress not found' });
      }

      userProgress.completedMinutes = Math.min(
        userProgress.completedMinutes + watchedMinutes,
        userProgress.totalMinutes
      );

      userProgress.progress = Math.round(
        (userProgress.completedMinutes / userProgress.totalMinutes) * 100
      );

      userProgress.status =
        userProgress.progress === 100
          ? 'completed'
          : userProgress.progress > 0
          ? 'in progress'
          : 'not started';

      userProgress.lastUpdated = new Date();

      await userProgress.save();

      return res.json({ message: 'Course progress incremented', progress: userProgress });
    }

    // 2) Handle setting total course progress directly (overwrite)
    if (totalProgress === true) {
      if (typeof totalMinutes !== 'number' || totalMinutes <= 0) {
        return res.status(400).json({ error: 'Invalid total minutes' });
      }

      const completedMins = Math.max(0, Math.min(completedMinutes || 0, totalMinutes));
      const progressPercent = Math.max(0, Math.min(progress || 0, 100));
      const status =
        progressPercent === 100
          ? 'completed'
          : progressPercent > 0
          ? 'in progress'
          : 'not started';

      const userProgress = await UserProgress.findOneAndUpdate(
        { userId, courseId },
        {
          $set: {
            completedMinutes: completedMins,
            totalMinutes,
            progress: progressPercent,
            status,
            lastUpdated: new Date(),
          },
        },
        { new: true, upsert: true }
      );

      return res.json({ message: 'Course progress updated', progress: userProgress });
    }

    // 3) Handle updating individual video progress
    if (videoId) {
      if (typeof videoId !== 'string' || videoId.trim() === '') {
        return res.status(400).json({ error: 'Invalid video ID' });
      }

      if (
        typeof completedMinutes !== 'number' ||
        typeof progress !== 'number' ||
        progress < 0 ||
        progress > 100
      ) {
        return res.status(400).json({ error: 'Invalid progress data' });
      }

      const videoProgress = await VideoProgress.findOneAndUpdate(
        { userId, courseId, videoId },
        {
          $set: {
            completedMinutes,
            progress,
            lastWatched: new Date(),
          },
        },
        { new: true, upsert: true }
      );

      await updateOverallProgress(userId, courseId);

      return res.json({ message: 'Video progress updated', progress: videoProgress });
    }

    return res.status(400).json({ error: 'Missing required parameters' });
  } catch (err) {
    console.error('Error updating progress:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Reset video progress
router.post('/reset-video', async (req, res) => {
  const { userId, courseId, videoId } = req.body;

  const cookieUserId = req.cookies.userId;
  if (!cookieUserId) {
    return res.status(403).json({ error: 'Unauthorized access: No user ID cookie' });
  }

  if (cookieUserId !== userId) {
    return res.status(403).json({ error: 'Unauthorized access: User ID mismatch' });
  }

  try {
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(courseId) || !videoId) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    await VideoProgress.findOneAndUpdate(
      { userId, courseId, videoId },
      { $set: { completedMinutes: 0, progress: 0 } }
    );

    await updateOverallProgress(userId, courseId);

    return res.json({ message: 'Video progress reset successfully' });
  } catch (err) {
    console.error('Error resetting video progress:', err);
    return res.status(500).json({ error: 'Failed to reset video progress' });
  }
});

// Get user progress
router.get('/get', async (req, res) => {
  const cookieUserId = req.cookies.userId; // from cookie
  const { userId, courseId } = req.query;

  if (!cookieUserId) {
    return res.status(403).json({ error: 'Unauthorized: No user ID cookie' });
  }

  if (cookieUserId !== userId) {
    return res.status(403).json({ error: 'Unauthorized access: User ID mismatch' });
  }

  try {
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const progress = await UserProgress.findOne({ userId, courseId });
    const videoProgress = await VideoProgress.find({ userId, courseId });

    return res.json({
      progress: progress?.progress || 0,
      completedMinutes: progress?.completedMinutes || 0,
      totalMinutes: progress?.totalMinutes || 0,
      status: progress?.status || 'not started',
      videoProgress
    });
  } catch (err) {
    console.error('Error getting progress:', err);
    return res.status(500).json({ error: 'Failed to get progress' });
  }
});


module.exports = router;