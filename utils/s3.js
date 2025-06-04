// utils/s3.js
const AWS = require('aws-sdk');
require('dotenv').config();
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

// Get bucket name from environment variables (check multiple possible names)
const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || process.env.AWS_BUCKET_NAME;

if (!BUCKET_NAME) {
  console.error('WARNING: Neither AWS_S3_BUCKET_NAME nor AWS_BUCKET_NAME environment variable is set');
  console.error('Available environment variables:', Object.keys(process.env).filter(key => key.includes('BUCKET')));
}

class S3Service {
  /**
   * Upload file to S3
   * @param {Buffer|Object} bufferOrParams - Either buffer or params object
   * @param {string} filename - Filename (used when first param is buffer)
   * @param {string} contentType - Content type (used when first param is buffer)
   * @returns {Promise<Object>} S3 upload result
   */
  static async uploadFile(bufferOrParams, filename, contentType) {
    try {
      let uploadParams;

      // Handle both old and new parameter formats
      if (Buffer.isBuffer(bufferOrParams)) {
        // Old format: uploadFile(buffer, filename, contentType)
        uploadParams = {
          Bucket: BUCKET_NAME,
          Key: filename,
          Body: bufferOrParams,
          ContentType: contentType || 'application/octet-stream',
        };
      } else if (typeof bufferOrParams === 'object') {
        // New format: uploadFile({ buffer, filename, contentType, bucket })
        const params = bufferOrParams;
        uploadParams = {
          Bucket: params.bucket || BUCKET_NAME,
          Key: params.filename,
          Body: params.buffer,
          ContentType: params.contentType || 'application/octet-stream',
        };
      } else {
        throw new Error('Invalid parameters provided to uploadFile');
      }

      if (!uploadParams.Bucket) {
        throw new Error(`Missing required S3 bucket name. Please set AWS_S3_BUCKET_NAME or AWS_BUCKET_NAME environment variable. Current bucket value: ${uploadParams.Bucket}`);
      }

      const result = await s3.upload(uploadParams).promise();
      
      return result;

    } catch (error) {
      console.error('S3 upload error details:', {
        message: error.message,
        bucket: BUCKET_NAME,
        availableEnvVars: Object.keys(process.env).filter(key => key.toLowerCase().includes('bucket'))
      });
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  /**
   * Delete file from S3
   */
  static async deleteFile(filename, bucket = BUCKET_NAME) {
    try {
      if (!bucket) {
        throw new Error('Missing required S3 bucket name for delete operation');
      }

      const deleteParams = {
        Bucket: bucket,
        Key: filename
      };

      console.log('Deleting from S3:', deleteParams);
      const result = await s3.deleteObject(deleteParams).promise();
      console.log('S3 delete successful for:', filename);
      return result;
    } catch (error) {
      console.error('S3 delete error:', error);
      throw new Error(`S3 delete failed: ${error.message}`);
    }
  }

  /**
   * Get signed URL for private files
   */
  static getSignedUrl(filename, bucket = BUCKET_NAME, expires = 3600) {
    try {
      if (!bucket) {
        throw new Error('Missing required S3 bucket name for signed URL');
      }

      const params = {
        Bucket: bucket,
        Key: filename,
        Expires: expires
      };

      return s3.getSignedUrl('getObject', params);
    } catch (error) {
      console.error('S3 signed URL error:', error);
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  /**
   * Check if S3 service is properly configured
   */
  static isConfigured() {
    return !!(BUCKET_NAME && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_REGION);
  }

  /**
   * Get current bucket name
   */
  static getBucketName() {
    return BUCKET_NAME;
  }

  /**
   * Test S3 connection
   */
  static async testConnection() {
    try {
      if (!BUCKET_NAME) {
        throw new Error('No bucket name configured');
      }

      await s3.headBucket({ Bucket: BUCKET_NAME }).promise();
      return { success: true, bucket: BUCKET_NAME };
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        bucket: BUCKET_NAME,
        configured: this.isConfigured()
      };
    }
  }
}

module.exports = S3Service;