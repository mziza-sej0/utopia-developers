/**
 * routes/payment.js — Payment processing with M-Pesa
 * Handles payment initiation, callbacks, and status queries
 */

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const router = Router();
const { initiatePayment, queryTransactionStatus, sendB2CPayment, getAccountBalance } = require('../safaricom');
const { Payment } = require('../models');
const { adminOnly } = require('../middleware/admin');

// ─── Rate Limiters ──────────────────────────────────────────────────────────
const paymentInitiateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute per IP
  message: 'Too many payment attempts, please try again later',
});

const payoutLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 payouts per minute
  message: 'Too many payout requests, please try again later',
});

// ─── Initiate M-Pesa Payment ────────────────────────────────────────────────

/**
 * POST /api/payment/initiate
 * Initiate M-Pesa STK push payment
 */
router.post('/initiate', paymentInitiateLimiter, async (req, res) => {
  try {
    let { phoneNumber, amount, description, reference } = req.body;

    // Validate input
    if (!phoneNumber || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and amount are required',
      });
    }

    // Validate phone number format (254XXXXXXXXX)
    phoneNumber = validator.trim(String(phoneNumber));
    if (!/^(?:\+?254|0)[0-9]{9}$/.test(phoneNumber.replace(/\s/g, ''))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format. Use format: 254712345678 or 0712345678',
      });
    }

    // Format phone number (254... format)
    let formattedPhone = phoneNumber.replace(/\s/g, '');
    if (!formattedPhone.startsWith('254')) {
      if (formattedPhone.startsWith('0')) {
        formattedPhone = '254' + formattedPhone.slice(1);
      } else {
        formattedPhone = '254' + formattedPhone;
      }
    }

    // Validate amount
    amount = parseFloat(amount);
    if (!Number.isFinite(amount) || amount < 1 || amount > 150000) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be between 1 and 150000',
      });
    }

    // Sanitize optional fields
    reference = validator.trim(String(reference || 'UTOPIA-SERVICE')).substring(0, 32);
    description = validator.trim(String(description || 'Payment to Utopia Developers')).substring(0, 200);
    const referenceText = reference;
    const descriptionText = description;

    // Initiate payment with Safaricom
    const result = await initiatePayment({
      phoneNumber: formattedPhone,
      amount,
      accountReference: referenceText,
      description: descriptionText,
      callbackUrl: process.env.SAFARICOM_RESULT_URL,
    });

    // Create a pending payment record in the database
    const payment = new Payment({
      checkoutRequestId: result.checkoutRequestId,
      phoneNumber: formattedPhone,
      amount,
      accountReference: referenceText,
      description: descriptionText,
    });
    await payment.save();

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
 * POST /api/payment/result
 * Webhook for M-Pesa payment result confirmation.
 * Safaricom calls this URL after payment
 */
router.post('/result', async (req, res) => {
  try {
    const { Body } = req.body;

    if (!Body || !Body.stkCallback) {
      return res.status(400).json({ success: false, error: 'Invalid callback' });
    }

    const { stkCallback } = Body;
    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;

    // Find the pending payment record
    const payment = await Payment.findOne({ checkoutRequestId: CheckoutRequestID });
    if (!payment) {
      console.error(`Payment not found for CheckoutRequestID: ${CheckoutRequestID}`);
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' }); // Acknowledge to prevent retries
    }

    // Log result callback for debugging
    console.log('M-Pesa Callback:', {
      checkoutId: CheckoutRequestID,
      resultCode: ResultCode,
      description: ResultDesc,
    });

    // Update payment record with the result from Safaricom
    payment.resultCode = ResultCode;
    payment.resultDescription = ResultDesc;

    // ResultCode 0 = Success
    if (ResultCode == 0 && CallbackMetadata) {
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

      // Update payment status to 'completed'
      payment.status = 'completed';
      payment.mpesaReceiptNumber = metadata.MpesaReceiptNumber;

      // Safaricom's date format is YYYYMMDDHHMMSS
      const ts = metadata.TransactionDate.toString();
      payment.transactionDate = new Date(
        `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}`
      );
    } else {
      console.log('❌ Payment Failed:', ResultDesc);
      // Update payment status using the helper function
      payment.status = mapPaymentStatus(ResultCode);
    }

    await payment.save();
    // Always respond with 200 to acknowledge receipt
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('Callback error:', error);
    res.status(500).json({ ResultCode: 1, ResultDesc: 'Failed' });
  }
});

/**
 * Maps Safaricom's transaction result codes to a simplified status.
 * @param {string} resultCode - The code from the Safaricom API.
 * @returns {'completed' | 'failed' | 'cancelled' | 'pending'}
 */
function mapPaymentStatus(resultCode) {
  // If the transaction is still being processed, Safaricom may not return a ResultCode yet.
  if (resultCode === undefined || resultCode === null) {
    return 'pending';
  }

  const code = String(resultCode);
  if (code === '0') return 'completed';

  // Common failure or cancellation codes from Safaricom documentation
  if (code === '1032') return 'cancelled'; // User cancelled the request
  if (['1', '1037'].includes(code)) return 'failed'; // e.g., Insufficient Funds, Timeout

  // For any other non-zero code, treat it as pending or failed depending on your business logic.
  return 'pending';
}

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
      status: mapPaymentStatus(result.resultCode),
      description: result.resultDescription,
      checkoutRequestId: result.checkoutRequestId,
      resultCode: result.resultCode, // Include the raw code for client-side logic
    });
  } catch (error) {
    console.error('Status query error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ─── List Successful Transactions (Admin) ───────────────────────────────────

/**
 * GET /api/payment/transactions
 * List all successful payments for an admin dashboard.
 * Includes pagination.
 */
router.get('/transactions', adminOnly, async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const skip = (page - 1) * limit;

    const query = { status: 'completed' };

    const [payments, total] = await Promise.all([
      Payment.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Payment.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: payments,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
  }
});

// ─── Send Payout (B2C) ───────────────────────────────────────────────────────

/**
 * POST /api/payment/payout
 * Send money to customer (admin only)
 * Usage: Refunds, bonuses, payments
 */
router.post('/payout', adminOnly, payoutLimiter, async (req, res) => {
  try {
    let { phoneNumber, amount, description } = req.body;

    if (!phoneNumber || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and amount are required',
      });
    }

    // Validate phone number format
    phoneNumber = validator.trim(String(phoneNumber));
    if (!/^(?:\+?254|0)[0-9]{9}$/.test(phoneNumber.replace(/\s/g, ''))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format. Use format: 254712345678 or 0712345678',
      });
    }

    // Format phone number (254... format)
    let formattedPhone = phoneNumber.replace(/\s/g, '');
    if (!formattedPhone.startsWith('254')) {
      if (formattedPhone.startsWith('0')) {
        formattedPhone = '254' + formattedPhone.slice(1);
      } else {
        formattedPhone = '254' + formattedPhone;
      }
    }

    // Validate amount
    amount = parseFloat(amount);
    if (!Number.isFinite(amount) || amount < 1 || amount > 150000) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be between 1 and 150000',
      });
    }

    // Sanitize description
    description = validator.trim(String(description || 'Payout from Utopia Developers')).substring(0, 200);

    const result = await sendB2CPayment({
      phoneNumber: formattedPhone,
      amount,
      description,
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
router.get('/balance', adminOnly, async (req, res) => {
  try {
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
