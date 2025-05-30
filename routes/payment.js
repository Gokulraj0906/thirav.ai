const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const authMiddleware = require('../middleware/auth');
const razorpay = require('../config/razorpay');
const Course = require('../models/Course');
const Coupon = require('../models/Coupon');
const Payment = require('../models/Payment');

router.post('/create-order', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    const { courseId, couponCode } = req.body;

    if (!courseId) {
      return res.status(400).json({ error: 'Course ID is required' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    let finalPrice = course.price;
    let appliedCoupon = null;

    // Apply coupon if provided
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode });

      if (!coupon) {
        return res.status(400).json({ error: 'Invalid coupon code' });
      }

      if (coupon.expiresAt < new Date()) {
        return res.status(400).json({ error: 'Coupon has expired' });
      }

      if (coupon.usedCount >= coupon.maxUses) {
        return res.status(400).json({ error: 'Coupon usage limit reached' });
      }

      finalPrice = finalPrice - (finalPrice * (coupon.discountPercentage / 100));
      appliedCoupon = coupon;
    }

    const amountInPaise = Math.round(finalPrice * 100);

    const receiptId = `receipt_${courseId.toString().slice(-6)}_${Date.now().toString().slice(-6)}`;

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: receiptId,
      payment_capture: 1,
    });

    const payment = new Payment({
      user: userId,
      course: courseId,
      razorpayOrderId: order.id,
      amount: finalPrice,
      status: 'pending',
      coupon: appliedCoupon ? appliedCoupon._id : null,
    });

    await payment.save();

    res.status(200).json({
      orderId: order.id,
      amount: finalPrice,
      currency: 'INR',
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
});

router.post('/verify', authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification data' });
    }

    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });

    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found' });
    }

    payment.razorpayPaymentId = razorpay_payment_id;
    payment.status = 'success';
    await payment.save();

    // Increment coupon usage only after successful payment
    if (payment.coupon) {
      await Coupon.findByIdAndUpdate(payment.coupon, { $inc: { usedCount: 1 } });
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
router.get('/check-access/:courseId', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user._id;

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