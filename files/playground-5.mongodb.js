// MongoDB Playground

// ============================================
// UTOPIA DEVELOPERS - Payment Testing Queries
// ============================================

// Switch to the correct database
use('utopia-developers');

// 1. View all payments
db.getCollection('payments').find({});

// 2. Find completed payments
db.getCollection('payments').find({
  status: "completed"
});

// 3. Find payments by phone number
db.getCollection('payments').find({
phone: "0141436260"
});

// 4. Get payment count by status
db.getCollection('payments').aggregate([
  {
    $group: {
      _id: "$status",
      count: { $sum: 1 },
      totalAmount: { $sum: "$amount" }
    }
  }
]);

// 5. Find highest payment
db.getCollection('payments').find({}).sort({ amount: -1 }).limit(1);

// 6. Check user by email
db.getCollection('users').find({
    email: "josemongi91@gmail.com"
});

// 7. View all contact messages
db.getCollection('contactmessages').find({});

// 8. Count total transactions
db.getCollection('payments').countDocuments({});

// 9. Recent payments (last 10)
db.getCollection('payments').find({}).sort({ transactionDate: -1 }).limit(10);

// 10. Monthly revenue summary
db.getCollection('payments').aggregate([
  {
    $group: {
      _id: { $dateToString: { format: "%Y-%m", date: "$transactionDate" } },
      totalRevenue: { $sum: "$amount" },
      transactionCount: { $sum: 1 }
    }
  },
  { $sort: { _id: -1 } }
  
]);
