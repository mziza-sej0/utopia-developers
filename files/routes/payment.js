/**
 * routes/payment.js — Payment processing with M-Pesa
 * Handles payment initiation, callbacks, and status queries
 */

const { Router } = require('express');
const router = Router();
const { initiatePayment, queryTransactionStatus, sendB2CPayment, getAccountBalance } = require('../safaricom');
const { ContactMessage } = require('../models');

// ─── Initiate M-Pesa Payment ────────────────────────────────────────────────

/**
 * POST /api/payment/initiate
 * Initiate M-Pesa STK push payment
 */
router.post('/initiate', async (req, res) => {
  try {
    const { phoneNumber, amount, description, reference } = req.body;

    // Validate input
    if (!phoneNumber || !amount || amount < 1) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and valid amount required',
      });
    }

    // Format phone number (254... format)
    const formattedPhone = phoneNumber.startsWith('254')
      ? phoneNumber
      : `254${phoneNumber.slice(-9)}`;

    // Initiate payment
    const result = await initiatePayment({
      phoneNumber: formattedPhone,
      amount,
      accountReference: reference || 'UTOPIA-SERVICE',
      description: description || 'Payment to Utopia Developers',
      callbackUrl: `${process.env.CLIENT_URL}/api/payment/callback`,
    });

    res.json({
      success: true,
      checkoutRequestId: result.checkoutRequestId,
      message: 'Payment initiated. Check your M-Pesa phone for prompt.',
    });
  } catch (error) {
    console.error('Payment initiation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate payment',
    });
  }
});

// ─── M-Pesa Callback Handler ──────────────────────────────────────────────

/**
 * POST /api/payment/callback
 * Webhook for M-Pesa payment confirmation
 * Safaricom calls this URL after payment
 */
router.post('/callback', async (req, res) => {
  try {
    const { Body } = req.body;

    if (!Body || !Body.stkCallback) {
      return res.status(400).json({ success: false, error: 'Invalid callback' });
    }

    const { stkCallback } = Body;
    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;

    // Log callback for debugging
    console.log('M-Pesa Callback:', {
      checkoutId: CheckoutRequestID,
      resultCode: ResultCode,
      description: ResultDesc,
    });

    // ResultCode 0 = Success
    if (ResultCode === 0 && CallbackMetadata) {
      const metadata = CallbackMetadata.Item.reduce((acc, item) => {
        acc[item.Name] = item.Value;
        return acc;
      }, {});

      console.log('✅ Payment Successful:', {
        amount: metadata.Amount,
        phone: metadata.PhoneNumber,
        mpesaRef: metadata.MpesaReceiptNumber,
        transactionDate: metadata.TransactionDate,
      });

      // TODO: Update payment status in database
      // await Payment.findByIdAndUpdate(..., { status: 'completed', mpesaRef: ... });
    } else {
      console.log('❌ Payment Failed:', ResultDesc);
      // TODO: Update payment status to failed
    }

    // Always respond with 200 to acknowledge receipt
    res.json({ ResultCode: 0 });
  } catch (error) {
    console.error('Callback error:', error);
    res.status(500).json({ ResultCode: 1, error: error.message });
  }
});

// ─── Query Payment Status ────────────────────────────────────────────────────

/**
 * GET /api/payment/status/:checkoutRequestId
 * Check the status of a specific payment
 */
router.get('/status/:checkoutRequestId', async (req, res) => {
  try {
    const { checkoutRequestId } = req.params;

    const result = await queryTransactionStatus(checkoutRequestId);

    res.json({
      success: result.success,
      status: result.resultCode === '0' ? 'completed' : 'pending',
      description: result.resultDescription,
      checkoutRequestId: result.checkoutRequestId,
    });
  } catch (error) {
    console.error('Status query error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ─── Send Payout (B2C) ───────────────────────────────────────────────────────

/**
 * POST /api/payment/payout
 * Send money to customer (admin only)
 * Usage: Refunds, bonuses, payments
 */
router.post('/payout', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware
    // if (!req.user || !req.user.isAdmin) {
    //   return res.status(403).json({ error: 'Admin only' });
    // }

    const { phoneNumber, amount, description } = req.body;

    if (!phoneNumber || !amount || amount < 1) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and valid amount required',
      });
    }

    const formattedPhone = phoneNumber.startsWith('254')
      ? phoneNumber
      : `254${phoneNumber.slice(-9)}`;

    const result = await sendB2CPayment({
      phoneNumber: formattedPhone,
      amount,
      description: description || 'Payout from Utopia Developers',
    });

    res.json({
      success: true,
      conversationId: result.conversationId,
      message: 'Payout initiated',
    });
  } catch (error) {
    console.error('Payout error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ─── Account Balance ────────────────────────────────────────────────────────

/**
 * GET /api/payment/balance
 * Check M-Pesa account balance (admin only)
 */
router.get('/balance', async (req, res) => {
  try {
    // TODO: Add admin authentication
    const result = await getAccountBalance();

    res.json({
      success: result.success,
      message: 'Balance check initiated',
      conversationId: result.conversationId,
    });
  } catch (error) {
    console.error('Balance check error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
