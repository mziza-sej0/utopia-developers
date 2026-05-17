# Safaricom M-Pesa Integration Guide

This guide explains how to set up and use the M-Pesa payment integration in your Utopia Developers backend.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Getting Credentials](#getting-credentials)
3. [Configuration](#configuration)
4. [Testing](#testing)
5. [API Endpoints](#api-endpoints)
6. [Production Setup](#production-setup)

---

## Prerequisites

- Node.js and npm installed
- Safaricom developer account
- M-Pesa Test Account (for sandbox testing)
- Postman or cURL for API testing

---

## Getting Credentials

### Step 1: Create Safaricom Developer Account

1. Go to [Safaricom Developer Portal](https://developer.safaricom.co.ke/)
2. Sign up for a free account
3. Verify your email

### Step 2: Create an Application

1. In the dashboard, click **"Create New Application"**
2. Fill in:
   - **App Name**: Utopia Developers
   - **App Type**: Web Application
3. Click **Create**

### Step 3: Get Credentials

Your new app dashboard will show:

```
Consumer Key: xxxxxxxxxxxxx
Consumer Secret: xxxxxxxxxxxxx
```

**Save these securely** — you'll need them in `.env`

### Step 4: Get Shortcode & Passkey

For **Test/Sandbox** environment:

- **Shortcode**: 174379 (pre-configured test code)
- **Passkey**: bfb279f9aa9bdbcf158e97dd1a503017 (test passkey)

For **Production**:

1. Apply for a **Paybill** or **Till Number**
2. Safaricom will provide your shortcode
3. Generate your passkey in the dashboard

---

## Configuration

### Step 1: Set Environment Variables

Copy `.env.example` to `.env`:

```bash
cp files/.env.example files/.env
```

### Step 2: Add Safaricom Credentials

Edit `files/.env` and add:

```env
# Safaricom M-Pesa
SAFARICOM_ENV=sandbox
SAFARICOM_CONSUMER_KEY=your_consumer_key_here
SAFARICOM_CONSUMER_SECRET=your_consumer_secret_here
SAFARICOM_SHORTCODE=174379
SAFARICOM_PASSKEY=bfb279f9aa9bdbcf158e97dd1a503017
SAFARICOM_INITIATOR=testapi
SAFARICOM_SECURITY_CREDENTIAL=base64_security_credential
SAFARICOM_QUEUE_URL=http://localhost:3000/api/payment/queue
SAFARICOM_RESULT_URL=http://localhost:3000/api/payment/result
```

### Step 3: Install Dependencies

```bash
cd files
npm install axios
```

---

## Testing

### Test M-Pesa Payment Initiation

Use the **Postman collection** included or test with cURL:

```bash
curl -X POST http://localhost:3000/api/payment/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "254712345678",
    "amount": 100,
    "description": "Test payment",
    "reference": "TEST-001"
  }'
```

**Expected Response:**

```json
{
  "success": true,
  "checkoutRequestId": "ws_CO_123456789",
  "message": "Payment initiated. Check your M-Pesa phone for prompt."
}
```

### Test Sandbox Phone Numbers

Use these test numbers in the sandbox environment:

- `254708374149` (valid test number)
- `254708374149` (another test)

**PIN**: Use any 4 digits in sandbox mode.

### Check Payment Status

```bash
curl http://localhost:3000/api/payment/status/ws_CO_123456789
```

---

## API Endpoints

### 1. **Initiate Payment (STK Push)**

```http
POST /api/payment/initiate
Content-Type: application/json

{
  "phoneNumber": "254712345678",
  "amount": 100,
  "description": "Payment for web development",
  "reference": "PROJECT-001"
}
```

**Response:**

```json
{
  "success": true,
  "checkoutRequestId": "ws_CO_123456789",
  "message": "Payment initiated. Check your M-Pesa phone for prompt."
}
```

### 2. **Query Payment Status**

```http
GET /api/payment/status/{checkoutRequestId}
```

**Response:**

```json
{
  "success": true,
  "status": "completed",
  "description": "The service request has been accepted successfully.",
  "checkoutRequestId": "ws_CO_123456789"
}
```

### 3. **M-Pesa Callback**

Safaricom automatically calls:

```
POST http://your-domain/api/payment/callback
```

Your server processes the payment result automatically.

### 4. **Send Payout (B2C)**

```http
POST /api/payment/payout
Content-Type: application/json

{
  "phoneNumber": "254712345678",
  "amount": 500,
  "description": "Project completion bonus"
}
```

### 5. **Check Account Balance**

```http
GET /api/payment/balance
```

---

## Production Setup

### Step 1: Upgrade Environment Variable

Change in `.env`:

```env
SAFARICOM_ENV=production
```

### Step 2: Use Real Credentials

Get from Safaricom after being approved for production:

```env
SAFARICOM_CONSUMER_KEY=prod_key_here
SAFARICOM_CONSUMER_SECRET=prod_secret_here
SAFARICOM_SHORTCODE=your_paybill_number
SAFARICOM_PASSKEY=your_production_passkey
```

### Step 3: Update Callback URLs

In Safaricom Dashboard, set:

```
Callback URL: https://your-domain.com/api/payment/callback
```

### Step 4: Deploy

```bash
git add .
git commit -m "Integrate Safaricom M-Pesa payments"
npm install
npm start
```

---

## Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid Consumer Key/Secret` | Credentials are wrong | Copy from dashboard again |
| `Invalid transaction type` | Shortcode doesn't support operation | Use correct shortcode |
| `Invalid phone number format` | Number format wrong | Use `254XXXXXXXXX` format |
| `Connection refused` | Server not running | Start with `npm start` |
| `Callback not received` | URL unreachable | Use ngrok for localhost testing |

---

## Testing with ngrok (Localhost)

For local testing with Safaricom callbacks:

```bash
# Install ngrok
brew install ngrok

# Start ngrok (exposes localhost:3000 to internet)
ngrok http 3000

# Update .env with ngrok URL
SAFARICOM_QUEUE_URL=https://xxxx-xxxx-xxx.ngrok.io/api/payment/queue
SAFARICOM_RESULT_URL=https://xxxx-xxxx-xxx.ngrok.io/api/payment/result
```

Now Safaricom can reach your local server!

---

## Monitoring Payments

All payments are stored in MongoDB:

```javascript
// In MongoDB Atlas or local:
db.payments.find()

// Results include:
{
  "phoneNumber": "254712345678",
  "amount": 100,
  "status": "completed",
  "mpesaReceiptNumber": "LIJ5EJK5H8",
  "transactionDate": "2026-05-17T10:30:00Z"
}
```

---

## Support

- **Safaricom Docs**: https://developer.safaricom.co.ke/docs
- **M-Pesa Errors**: Check the Safaricom error code reference
- **Your Backend**: Check server logs with `npm start`

Happy payments! 💳
