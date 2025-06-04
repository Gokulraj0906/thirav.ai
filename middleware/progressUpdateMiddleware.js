// middleware/progressUpdateMiddleware.js
const UserProgress = require('../models/UserProgress');
const CertificateController = require('../controllers/certificateController');

/**
 * Middleware to automatically generate certificate when course is completed
 * Add this to your video progress update route
 */
const checkCourseCompletionAndGenerateCertificate = async (req, res, next) => {
  try {
    // Store original response.json function
    const originalJson = res.json;
    
    // Override response.json to intercept the response
    res.json = async function(data) {
      try {
        // Only proceed if the request was successful
        if (data.success && req.method === 'PUT' || req.method === 'PATCH') {
          const userId = req.user.id;
          const courseId = req.params.courseId || req.body.courseId;
          
          if (userId && courseId) {
            // Check if course is now completed
            const userProgress = await UserProgress.findOne({ userId, courseId });
            
            if (userProgress && 
                userProgress.status === 'completed' && 
                userProgress.progress >= 100) {
              
              // Try to auto-generate certificate
              const certificate = await CertificateController.autoGenerateCertificate(userId, courseId);
              
              if (certificate) {
                // Add certificate info to response
                data.certificateGenerated = true;
                data.certificate = {
                  id: certificate._id,
                  certificateNumber: certificate.certificateNumber,
                  verificationCode: certificate.verificationCode,
                  certificateUrl: certificate.certificateUrl
                };
              }
            }
          }
        }
        
        // Call original json function with modified data
        originalJson.call(this, data);
      } catch (error) {
        console.error('Error in certificate generation middleware:', error);
        // Still send original response even if certificate generation fails
        originalJson.call(this, data);
      }
    };
    
    next();
  } catch (error) {
    console.error('Error in progress update middleware:', error);
    next();
  }
};

module.exports = {
  checkCourseCompletionAndGenerateCertificate
};