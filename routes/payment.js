const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const authMiddleware = require('../middleware/auth');
const razorpay = require('../config/razorpay');
const Course = require('../models/Course');
const Payment = require('../models/Payment');

router.post('/create-order', async (req, res) => {
  try {
    const userId = req.body.userId || req.query.userId;
    const { courseId } = req.body;

    if (!courseId) {
      return res.status(400).json({ error: 'Course ID is required' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const amountInPaise = course.price * 100;

    const receiptId = `receipt_${courseId.toString().slice(-6)}_${Date.now().toString().slice(-6)}`;

    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: receiptId,
      payment_capture: 1,
    };

    const order = await razorpay.orders.create(options);

    const payment = new Payment({
      user: userId,
      course: courseId,
      razorpayOrderId: order.id,
      amount: course.price,
      status: 'pending',
    });

    await payment.save();

    res.status(200).json({
      orderId: order.id,
      amount: course.price,
      currency: 'INR',
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
});

// Verify Payment
router.post('/verify', async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification data' });
    }

    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    const payment = await Payment.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        razorpayPaymentId: razorpay_payment_id,
        status: 'success',
      },
      { new: true }
    );

    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found' });
    }

    res.status(200).json({
      message: 'Payment verified successfully',
      courseId: payment.course,
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// Check if user has access to course
router.get('/check-access/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params || req.query.userId;
    const userId = req.query.userId;

    const payment = await Payment.findOne({
      user: userId,
      course: courseId,
      status: 'success',
    });

    res.status(200).json({ hasAccess: Boolean(payment) });
  } catch (error) {
    console.error('Error checking access:', error);
    res.status(500).json({ error: 'Failed to check course access' });
  }
});

module.exports = router;