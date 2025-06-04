// routes/certificateRoutes.js
const express = require('express');
const CertificateController = require('../controllers/certificateController');
const authMiddleware = require('../middleware/auth'); 
const adminMiddleware = require('../middleware/authorizeAdmin'); 

const router = express.Router();

router.get('/verify/:verificationCode', CertificateController.verifyCertificate);

router.use(authMiddleware);

router.get('/eligibility/:courseId', CertificateController.checkEligibility);

router.post('/generate/:courseId', CertificateController.generateCertificate);

router.get('/my-certificates', CertificateController.getUserCertificates);

router.get('/download/:certificateId', CertificateController.downloadCertificate);

router.use(adminMiddleware);
router.patch('/revoke/:certificateId', CertificateController.revokeCertificate);

module.exports = router;