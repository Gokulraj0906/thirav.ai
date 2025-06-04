// services/certificateService.js
const Certificate = require('../models/Certificate');
const UserProgress = require('../models/UserProgress');
const Course = require('../models/Course');
const User = require('../models/User');
const PDFDocument = require('pdfkit');
const stream = require('stream');
const crypto = require('crypto');

class CertificateService {
  static async checkEligibility(userId, courseId) {
    try {
      const userProgress = await UserProgress.findOne({ userId, courseId });
      if (!userProgress) return { eligible: false, reason: 'No progress found' };
      if (userProgress.status !== 'completed') return { eligible: false, reason: 'Course not completed' };
      if (userProgress.progress < 100) return { eligible: false, reason: 'Course progress less than 100%' };

      // Check for existing valid certificate
      const existingCertificate = await Certificate.findOne({ userId, courseId, isValid: true });
      if (existingCertificate) {
        return {
          eligible: false,
          reason: 'Valid certificate already exists',
          certificate: existingCertificate
        };
      }

      return { eligible: true, userProgress };
    } catch (error) {
      throw new Error(`Error checking eligibility: ${error.message}`);
    }
  }

  static async generateCertificate(userId, courseId) {
    try {
      // First check if user has already completed and has a valid certificate
      const existingValidCert = await Certificate.findOne({ 
        userId, 
        courseId, 
        isValid: true 
      });

      if (existingValidCert) {
        // Return existing valid certificate
        const buffer = await this.generateCertificatePDFBuffer(existingValidCert);
        return {
          buffer,
          metadata: existingValidCert,
          isExisting: true
        };
      }

      // Check eligibility for new certificate
      const eligibility = await this.checkEligibility(userId, courseId);
      if (!eligibility.eligible && !eligibility.certificate) {
        throw new Error(eligibility.reason);
      }

      const [user, course] = await Promise.all([
        User.findById(userId),
        Course.findById(courseId)
      ]);

      if (!user || !course) throw new Error('User or Course not found');

      // Invalidate any existing certificates for this user-course combination
      await Certificate.updateMany(
        { userId, courseId, isValid: true },
        { isValid: false, revokedAt: new Date(), revocationReason: 'Replaced by new certificate' }
      );

      // Generate certificate number
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');

      const startOfMonth = new Date(year, now.getMonth(), 1);
      const startOfNextMonth = new Date(year, now.getMonth() + 1, 1);

      const count = await Certificate.countDocuments({
        createdAt: { $gte: startOfMonth, $lt: startOfNextMonth }
      });

      const certificateNumber = `CERT-${year}${month}-${String(count + 1).padStart(4, '0')}`;
      const verificationCode = crypto.randomBytes(8).toString('hex').toUpperCase();
      const studentName = user.username || `${user.firstName} ${user.lastName}`.trim();

      const certificate = new Certificate({
        userId,
        courseId,
        certificateNumber,
        verificationCode,
        studentName,
        courseTitle: course.title,
        completionDate: new Date(),
        totalCourseDuration: course.totalMinutes || 0,
        finalScore: 100,
        isValid: true,
        issueDate: new Date(),
      });

      await certificate.save();

      const buffer = await this.generateCertificatePDFBuffer(certificate);
      return { 
        buffer, 
        metadata: certificate,
        isExisting: false 
      };
    } catch (error) {
      throw new Error(`Error generating certificate: ${error.message}`);
    }
  }

  static async generateCertificatePDFBuffer(certificate) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ 
          layout: 'landscape', 
          size: 'A4', 
          margins: { top: 50, bottom: 50, left: 50, right: 50 } 
        });
        const buffers = [];
        const outputStream = new stream.PassThrough();

        outputStream.on('data', (chunk) => buffers.push(chunk));
        outputStream.on('end', () => resolve(Buffer.concat(buffers)));
        doc.pipe(outputStream);

        const pageWidth = doc.page.width;
        const centerX = pageWidth / 2;

        // Border design
        doc.rect(40, 40, pageWidth - 80, doc.page.height - 80).lineWidth(3).stroke('#1a365d');
        doc.rect(50, 50, pageWidth - 100, doc.page.height - 100).lineWidth(1).stroke('#2d3748');

        // Title
        doc.fontSize(32).font('Helvetica-Bold').fillColor('#1a365d')
          .text('CERTIFICATE OF COMPLETION', 70, 120, { align: 'center', width: pageWidth - 140 });
        doc.moveTo(centerX - 100, 170).lineTo(centerX + 100, 170).lineWidth(2).stroke('#4a5568');

        // Content
        doc.fontSize(18).font('Helvetica').fillColor('#2d3748')
          .text('This is to certify that', 70, 220, { align: 'center', width: pageWidth - 140 });
        doc.fontSize(28).font('Helvetica-Bold').fillColor('#1a365d')
          .text(certificate.studentName.toUpperCase(), 70, 260, { align: 'center', width: pageWidth - 140 });
        doc.fontSize(18).font('Helvetica').fillColor('#2d3748')
          .text('has successfully completed the course', 70, 320, { align: 'center', width: pageWidth - 140 });
        doc.fontSize(24).font('Helvetica-Bold').fillColor('#1a365d')
          .text(`"${certificate.courseTitle}"`, 70, 360, { align: 'center', width: pageWidth - 140 });

        // Course details
        const durationHours = Math.round(certificate.totalCourseDuration / 60 * 10) / 10;
        doc.fontSize(14).font('Helvetica').fillColor('#4a5568')
          .text(`Course Duration: ${durationHours} hours`, 70, 420, { align: 'center', width: pageWidth - 140 });

        // Footer information
        const completionDate = certificate.completionDate.toLocaleDateString('en-US', { 
          year: 'numeric', month: 'long', day: 'numeric' 
        });
        doc.fontSize(14)
          .text(`Completion Date: ${completionDate}`, 70, 480, { align: 'left', width: (pageWidth - 140) / 2 });
        doc.text(`Certificate No: ${certificate.certificateNumber}`, centerX, 480, { 
          align: 'right', width: (pageWidth - 140) / 2 
        });

        doc.fontSize(10).fillColor('#718096')
          .text(`Verification Code: ${certificate.verificationCode}`, 70, 520, { 
            align: 'center', width: pageWidth - 140 
          });

        // Signature
        doc.fontSize(12).fillColor('#2d3748')
          .text('___________________________', centerX - 100, 560)
          .text('Authorized Signature', centerX - 100, 580, { align: 'center', width: 200 });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  static async getUserCertificates(userId) {
    try {
      const certificates = await Certificate.find({ 
        userId, 
        isValid: true 
      })
      .populate('courseId', 'title description')
      .sort({ createdAt: -1 });

      return certificates;
    } catch (error) {
      throw new Error(`Error fetching user certificates: ${error.message}`);
    }
  }

  static async verifyCertificate(verificationCode) {
    try {
      const certificate = await Certificate.findOne({ 
        verificationCode: verificationCode.toUpperCase(),
        isValid: true 
      })
      .populate('userId', 'firstName lastName username')
      .populate('courseId', 'title');

      if (!certificate) {
        return { valid: false, message: 'Certificate not found or invalid' };
      }

      return {
        valid: true,
        certificate: {
          certificateNumber: certificate.certificateNumber,
          studentName: certificate.studentName,
          courseTitle: certificate.courseTitle,
          completionDate: certificate.completionDate,
          issueDate: certificate.issueDate,
          totalCourseDuration: certificate.totalCourseDuration
        }
      };
    } catch (error) {
      throw new Error(`Error verifying certificate: ${error.message}`);
    }
  }

  static async revokeCertificate(certificateId, reason = 'Revoked by admin') {
    try {
      const certificate = await Certificate.findById(certificateId)
        .populate('userId', 'email firstName lastName')
        .populate('courseId', 'title');

      if (!certificate) {
        throw new Error(`Certificate not found with ID: ${certificateId}`);
      }

      if (!certificate.isValid) {
        throw new Error('Certificate is already revoked');
      }

      // Update certificate to mark as revoked
      certificate.isValid = false;
      certificate.revokedAt = new Date();
      certificate.revocationReason = reason;
      await certificate.save();

      return {
        ...certificate.toObject(),
        email: certificate.userId?.email || 'Unknown',
        courseTitle: certificate.courseId?.title || certificate.courseTitle
      };
    } catch (error) {
      throw new Error(`Error revoking certificate: ${error.message}`);
    }
  }
}

module.exports = CertificateService;