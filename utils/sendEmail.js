const nodemailer = require('nodemailer');
require('dotenv').config();

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      try {
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
          }
        });

        this.transporter.verify((error, success) => {
          if (error) {
            console.error('Email verification failed:', error);
            this.transporter = null;
          } else {
            console.log('Email server is ready to send messages');
          }
        });
      } catch (err) {
        console.error('Failed to initialize email transporter:', err);
        this.transporter = null;
      }
    }
  }

  isAvailable() {
    return this.transporter !== null;
  }

  async sendEmail({ to, subject, text }) {
    if (!this.transporter) {
      throw new Error('Email transporter not available');
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      text
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log(`Email sent successfully to ${to}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Email sending error:', error);
      throw error;
    }
  }
}

const emailService = new EmailService();
module.exports = emailService;