const { Schema, model } = require('mongoose');

const paymentSchema = new Schema(
  {
    // You can link this to a User model if payments are tied to authenticated users
    // user: { type: Schema.Types.ObjectId, ref: 'User' },

    checkoutRequestId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    phoneNumber: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'cancelled'],
      default: 'pending',
    },
    accountReference: String,
    description: String,

    // --- Fields updated on callback from Safaricom ---
    mpesaReceiptNumber: String,
    resultCode: String,
    resultDescription: String,
    transactionDate: Date,
  },
  { timestamps: true } // Automatically adds createdAt and updatedAt
);

const Payment = model('Payment', paymentSchema);

module.exports = Payment;