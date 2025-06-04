const CertificateService = require('../services/certificateService');
const UserProgress = require('../models/UserProgress');
const Certificate = require('../models/Certificate');
const S3Service = require('../utils/s3');
const emailService = require('../utils/sendEmail');
const path = require('path');
const mongoose = require('mongoose');
class CertificateController {
  static async generateCertificate(req, res) {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;
    const userEmail = req.user.email;

    // Check S3 configuration before proceeding
    if (!S3Service.isConfigured()) {
      console.error('S3 not properly configured');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: S3 storage not configured properly'
      });
    }

    // First, check if certificate exists and get course details
    const existingCertificate = await Certificate.findOne({ 
      userId: new mongoose.Types.ObjectId(userId), 
      courseId: new mongoose.Types.ObjectId(courseId) 
    });

    // If certificate exists and is valid with URL, return it
    if (existingCertificate && existingCertificate.isValid && existingCertificate.certificateUrl) {
      return res.status(200).json({
        success: true,
        message: 'Certificate already exists',
        data: {
          certificate: {
            id: existingCertificate._id,
            certificateNumber: existingCertificate.certificateNumber,
            studentName: existingCertificate.studentName,
            courseTitle: existingCertificate.courseTitle,
            completionDate: existingCertificate.completionDate,
            certificateUrl: existingCertificate.certificateUrl,
            verificationCode: existingCertificate.verificationCode,
            isExisting: true
          }
        }
      });
    }

    // Generate certificate PDF and metadata
    const { buffer, metadata, isExisting } = await CertificateService.generateCertificate(userId, courseId);

    if (!metadata?.certificateNumber) {
      throw new Error('Invalid certificate data returned');
    }

    // If existing valid certificate, return early
    if (isExisting && metadata.certificateUrl) {
      return res.status(200).json({
        success: true,
        message: 'Certificate already exists',
        data: {
          certificate: {
            id: metadata._id,
            certificateNumber: metadata.certificateNumber,
            studentName: metadata.studentName,
            courseTitle: metadata.courseTitle,
            completionDate: metadata.completionDate,
            certificateUrl: metadata.certificateUrl,
            verificationCode: metadata.verificationCode,
            isExisting: true
          }
        }
      });
    }

    // Upload to S3 (only if we have a buffer - new certificate)
    let certificateUrl = metadata.certificateUrl; // Use existing URL if available
    
    if (buffer) {
      const fileName = `certificate-${metadata.certificateNumber}.pdf`;
      
      try {
      
        const s3Result = await S3Service.uploadFile({
          buffer: buffer,
          filename: `certificates/${fileName}`,
          contentType: 'application/pdf'
        });

        certificateUrl = s3Result.Location;
      } catch (s3Error) {
        console.error('S3 upload failed:', s3Error);
        throw new Error(`Failed to upload certificate to S3: ${s3Error.message}`);
      }
    }

    // Update certificate with S3 URL if it's new
    if (buffer && certificateUrl !== metadata.certificateUrl) {
      await Certificate.findByIdAndUpdate(metadata._id, {
        certificateUrl: certificateUrl,
        updatedAt: new Date()
      });
      metadata.certificateUrl = certificateUrl;
    }

    // Send email notification
    try {
      if (emailService.isAvailable()) {
        await emailService.sendEmail({
          to: userEmail,
          subject: 'Your Certificate from thirav.ai',
          text: `Congratulations! Your certificate for "${metadata.courseTitle}" is ready.\n\nCertificate Details:\n- Certificate Number: ${metadata.certificateNumber}\n- Completion Date: ${metadata.completionDate.toLocaleDateString()}\n- Verification Code: ${metadata.verificationCode}\n\nDownload your certificate: ${metadata.certificateUrl}\n\nBest regards,\nThirav.ai Team`
        });
      }
    } catch (emailError) {
      console.warn('Email notification failed:', emailError.message);
      // Don't fail the request if email fails
    }

    return res.status(isExisting ? 200 : 201).json({
      success: true,
      message: isExisting ? 'Certificate updated successfully' : 'Certificate generated successfully',
      data: {
        certificate: {
          id: metadata._id,
          certificateNumber: metadata.certificateNumber,
          studentName: metadata.studentName,
          courseTitle: metadata.courseTitle,
          completionDate: metadata.completionDate,
          certificateUrl: metadata.certificateUrl,
          verificationCode: metadata.verificationCode,
          isExisting: isExisting
        }
      }
    });
  } catch (error) {
    console.error('Certificate generation error:', error);
    
    // Handle specific MongoDB duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({ 
        success: false, 
        message: 'Certificate generation conflict. Please try again.' 
      });
    }
    
    return res.status(400).json({ 
      success: false, 
      message: error.message 
    });
  }
}

  static async checkEligibility(req, res) {
    try {
      const { courseId } = req.params;
      const userId = req.user.id;

      const eligibility = await CertificateService.checkEligibility(userId, courseId);
      res.json({ success: true, data: eligibility });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getUserCertificates(req, res) {
    try {
      const userId = req.user.id;
      const certificates = await CertificateService.getUserCertificates(userId);

      res.json({
        success: true,
        data: {
          certificates: certificates.map(cert => ({
            id: cert._id,
            certificateNumber: cert.certificateNumber,
            courseTitle: cert.courseTitle,
            completionDate: cert.completionDate,
            certificateUrl: cert.certificateUrl,
            verificationCode: cert.verificationCode,
            isValid: cert.isValid,
            course: cert.courseId
          }))
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async verifyCertificate(req, res) {
    try {
      const { verificationCode } = req.params;
      const verification = await CertificateService.verifyCertificate(verificationCode);

      res.json({ success: true, data: verification });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async downloadCertificate(req, res) {
  try {
    const { certificateId } = req.params;
    const userId = req.user.id;

    const certificate = await Certificate.findOne({ 
      _id: certificateId, 
      userId,
      isValid: true 
    });

    if (!certificate) {
      // Get user's available certificates for better error message
      const userCertificates = await Certificate.find({ userId });
      
      return res.status(404).json({ 
        success: false, 
        message: 'Certificate not found or invalid',
        availableCertificates: userCertificates.map(cert => ({
          id: cert._id,
          name: cert.name || 'Unnamed Certificate',
          isValid: cert.isValid
        }))
      });
    }

    if (!certificate.certificateUrl) {
      return res.status(400).json({ 
        success: false, 
        message: 'Certificate file not available' 
      });
    }

    res.redirect(certificate.certificateUrl);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

  static async autoGenerateCertificate(userId, courseId, userEmail) {
    try {
      // Check if user has completed the course
      const userProgress = await UserProgress.findOne({ userId, courseId });

      if (!userProgress || userProgress.status !== 'completed' || userProgress.progress < 100) {
        return null;
      }

      // Check if valid certificate already exists
      const existingCert = await Certificate.findOne({ 
        userId, 
        courseId, 
        isValid: true 
      });

      if (existingCert) {
        return existingCert;
      }

      // Generate new certificate
      const { buffer, metadata } = await CertificateService.generateCertificate(userId, courseId);
      
      if (!buffer || !metadata) {
        console.error('Failed to generate certificate data');
        return null;
      }

      // Upload to S3
      const fileName = `certificate-${metadata.certificateNumber}.pdf`;
      
      try {
        const s3Result = await S3Service.uploadFile({
          buffer: buffer,
          filename: `certificates/${fileName}`,
          contentType: 'application/pdf'
        });

        // Update certificate with S3 URL
        metadata.certificateUrl = s3Result.Location;
        await metadata.save();

      } catch (s3Error) {
        console.error('Auto-generate S3 Upload Error:', s3Error);
        return null;
      }

      // Send email notification
      try {
        if (emailService.isAvailable()) {
          await emailService.sendEmail({
            to: userEmail,
            subject: 'Your Certificate from thirav.ai',
            text: `Congratulations! Your certificate for "${metadata.courseTitle}" has been automatically generated.\n\nCertificate Details:\n- Certificate Number: ${metadata.certificateNumber}\n- Completion Date: ${metadata.completionDate.toLocaleDateString()}\n- Verification Code: ${metadata.verificationCode}\n\nDownload your certificate: ${metadata.certificateUrl}\n\nBest regards,\nThirav.ai Team`
          });
        }
      } catch (emailError) {
        console.warn('Auto-generate email sending failed:', emailError.message);
      }

      return metadata;
    } catch (error) {
      console.error('Error auto-generating certificate:', error);
      return null;
    }
  }

  static async revokeCertificate(req, res) {
  try {
    const { certificateId } = req.params;
    const { reason } = req.body;

    // Validate certificate exists
    const existingCertificate = await Certificate.findById(certificateId);
    if (!existingCertificate) {
      return res.status(404).json({
        success: false,
        message: `Certificate with ID ${certificateId} not found`
      });
    }

    // Store certificate data for email before deletion
    const certificateData = {
      _id: existingCertificate._id,
      certificateNumber: existingCertificate.certificateNumber,
      studentName: existingCertificate.studentName,
      courseTitle: existingCertificate.courseTitle,
      certificateUrl: existingCertificate.certificateUrl,
      userId: existingCertificate.userId,
      courseId: existingCertificate.courseId
    };
    // Mark certificate as invalid
    let userEmail = req.user.email; 
    try {
      const user = await User.findById(certificateData.userId);
      userEmail = user?.email;
    } catch (userError) {
      console.warn('Failed to get user email:', userError.message);
    }

    // Delete from S3 if exists
    if (certificateData.certificateUrl) {
      try {
        const urlParts = certificateData.certificateUrl.split('/');
        const s3Key = urlParts.slice(-2).join('/'); 

        await S3Service.deleteFile(s3Key);
      } catch (s3Error) {
        console.warn('Failed to delete certificate from S3:', s3Error.message);
  
      }
    }

    // Delete certificate from database
    await Certificate.findByIdAndDelete(certificateId);

    // Send revocation email if user email is available
    if (userEmail && emailService.isAvailable()) {
      try {
        await emailService.sendEmail({
          to: userEmail,
          subject: 'Certificate Revoked - thirav.ai',
          text: `Your certificate for "${certificateData.courseTitle}" has been revoked and removed.\n\nRevocation Details:\n- Certificate Number: ${certificateData.certificateNumber}\n- Revocation Date: ${new Date().toLocaleDateString()}\n- Reason: ${reason || 'Not specified'}\n\nThe certificate has been permanently deleted from our system.\n\nIf you have any questions, please contact support.\n\nBest regards,\nThirav.ai Team`
        });
      } catch (emailError) {
        console.warn('Failed to send revocation email:', emailError.message);
      }
    }

    res.json({
      success: true,
      message: 'Certificate revoked and deleted successfully',
      data: {
        certificateId: certificateData._id,
        certificateNumber: certificateData.certificateNumber,
        studentName: certificateData.studentName,
        courseTitle: certificateData.courseTitle,
        revokedAt: new Date(),
        reason: reason || 'Not specified',
        deleted: true
      }
    });
  } catch (error) {
    console.error('Revocation error:', error);
    res.status(500).json({ 
      success: false, 
      message: `Failed to revoke certificate: ${error.message}` 
    });
  }
}
}
module.exports = CertificateController;