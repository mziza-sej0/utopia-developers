/**
 * safaricom.js — Safaricom M-Pesa & APIs integration
 * Handles OAuth, payment requests, and transaction management
 */

const axios = require('axios');

// Base URLs
const SANDBOX_BASE = 'https://sandbox.safaricom.co.ke';
const PRODUCTION_BASE = 'https://api.safaricom.co.ke';

const BASE_URL = process.env.SAFARICOM_ENV === 'production' ? PRODUCTION_BASE : SANDBOX_BASE;

// ─── Authentication ─────────────────────────────────────────────────────────

/**
 * Get access token for Safaricom APIs
 */
async function getAccessToken() {
  try {
    const credentials = Buffer.from(
      `${process.env.SAFARICOM_CONSUMER_KEY}:${process.env.SAFARICOM_CONSUMER_SECRET}`
    ).toString('base64');

    const response = await axios.get(`${BASE_URL}/oauth/v1/generate`, {
      headers: {
        Authorization: `Basic ${credentials}`,
      },
      params: {
        grant_type: 'client_credentials',
      },
    });

    return response.data.access_token;
  } catch (error) {
    console.error('Failed to get Safaricom access token:', error.response?.data || error.message);
    throw new Error('Safaricom authentication failed');
  }
}

// ─── M-Pesa Transactions ────────────────────────────────────────────────────

/**
 * Initiate M-Pesa payment (STK Push)
 * Prompts customer to enter M-Pesa PIN on their phone
 */
async function initiatePayment(options) {
  const { phoneNumber, amount, accountReference, description, callbackUrl } = options;

  try {
    const token = await getAccessToken();
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(
      `${process.env.SAFARICOM_SHORTCODE}${process.env.SAFARICOM_PASSKEY}${timestamp}`
    ).toString('base64');

    const response = await axios.post(
      `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: process.env.SAFARICOM_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(amount),
        PartyA: phoneNumber,
        PartyB: process.env.SAFARICOM_SHORTCODE,
        PhoneNumber: phoneNumber,
        CallBackURL: callbackUrl,
        AccountReference: accountReference,
        TransactionDesc: description,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return {
      success: true,
      checkoutRequestId: response.data.CheckoutRequestID,
      responseCode: response.data.ResponseCode,
      message: response.data.ResponseDescription,
    };
  } catch (error) {
    console.error('M-Pesa payment initiation error:', error.response?.data || error.message);
    throw new Error('Failed to initiate M-Pesa payment');
  }
}

/**
 * Query M-Pesa transaction status
 */
async function queryTransactionStatus(checkoutRequestId) {
  try {
    const token = await getAccessToken();
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(
      `${process.env.SAFARICOM_SHORTCODE}${process.env.SAFARICOM_PASSKEY}${timestamp}`
    ).toString('base64');

    const response = await axios.post(
      `${BASE_URL}/mpesa/stkpushquery/v1/query`,
      {
        BusinessShortCode: process.env.SAFARICOM_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return {
      success: response.data.ResponseCode === '0',
      resultCode: response.data.ResultCode,
      resultDescription: response.data.ResultDesc,
      checkoutRequestId: response.data.CheckoutRequestID,
      merchantRequestId: response.data.MerchantRequestID,
    };
  } catch (error) {
    console.error('Transaction query error:', error.response?.data || error.message);
    throw new Error('Failed to query transaction status');
  }
}

// ─── B2C Payments (Payouts) ────────────────────────────────────────────────

/**
 * Send money to customer (B2C)
 * Used for payouts, refunds, bonuses
 */
async function sendB2CPayment(options) {
  const { phoneNumber, amount, description, commandId = 'BusinessPayment' } = options;

  try {
    const token = await getAccessToken();

    const response = await axios.post(
      `${BASE_URL}/mpesa/b2c/v1/paymentrequest`,
      {
        OriginatorConversationID: `${Date.now()}-${Math.random()}`,
        InitiatorName: process.env.SAFARICOM_INITIATOR,
        SecurityCredential: process.env.SAFARICOM_SECURITY_CREDENTIAL,
        CommandID: commandId,
        Amount: Math.round(amount),
        PartyA: process.env.SAFARICOM_SHORTCODE,
        PartyB: phoneNumber,
        Remarks: description,
        QueueTimeOutURL: process.env.SAFARICOM_QUEUE_URL,
        ResultURL: process.env.SAFARICOM_RESULT_URL,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return {
      success: response.data.ResponseCode === '0',
      conversationId: response.data.OriginatorConversationID,
      responseCode: response.data.ResponseCode,
      message: response.data.ResponseDescription,
    };
  } catch (error) {
    console.error('B2C payment error:', error.response?.data || error.message);
    throw new Error('Failed to send B2C payment');
  }
}

// ─── Account Balance ───────────────────────────────────────────────────────

/**
 * Check M-Pesa account balance
 */
async function getAccountBalance() {
  try {
    const token = await getAccessToken();

    const response = await axios.post(
      `${BASE_URL}/mpesa/accountbalance/v1/query`,
      {
        Initiator: process.env.SAFARICOM_INITIATOR,
        SecurityCredential: process.env.SAFARICOM_SECURITY_CREDENTIAL,
        CommandID: 'GetAccount',
        PartyA: process.env.SAFARICOM_SHORTCODE,
        IdentifierType: '4',
        Remarks: 'Balance check',
        QueueTimeOutURL: process.env.SAFARICOM_QUEUE_URL,
        ResultURL: process.env.SAFARICOM_RESULT_URL,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return {
      success: response.data.ResponseCode === '0',
      conversationId: response.data.OriginatorConversationID,
      message: response.data.ResponseDescription,
    };
  } catch (error) {
    console.error('Account balance check error:', error.response?.data || error.message);
    throw new Error('Failed to check account balance');
  }
}

// ─── Transaction Status & Reconciliation ──────────────────────────────────

/**
 * Get transaction status by reference
 */
async function getTransactionStatus(conversationId) {
  try {
    const token = await getAccessToken();

    const response = await axios.post(
      `${BASE_URL}/mpesa/transactionstatus/v1/query`,
      {
        Initiator: process.env.SAFARICOM_INITIATOR,
        SecurityCredential: process.env.SAFARICOM_SECURITY_CREDENTIAL,
        CommandID: 'TransactionStatusQuery',
        TransactionID: conversationId,
        PartyA: process.env.SAFARICOM_SHORTCODE,
        IdentifierType: '4',
        ResultURL: process.env.SAFARICOM_RESULT_URL,
        QueueTimeOutURL: process.env.SAFARICOM_QUEUE_URL,
        Remarks: 'Status check',
        Occasion: 'Payment',
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return {
      success: response.data.ResponseCode === '0',
      message: response.data.ResponseDescription,
      requestId: response.data.ConversationID,
    };
  } catch (error) {
    console.error('Transaction status error:', error.response?.data || error.message);
    throw new Error('Failed to get transaction status');
  }
}

module.exports = {
  getAccessToken,
  initiatePayment,
  queryTransactionStatus,
  sendB2CPayment,
  getAccountBalance,
  getTransactionStatus,
};
