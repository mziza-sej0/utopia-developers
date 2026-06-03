require('dotenv').config();
const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.error('Error: MONGODB_URI environment variable not found in your .env file.');
  process.exit(1);
}

console.log('\n=== MongoDB Connection Test ===\n');
console.log('URI:', mongoUri.replace(/:[^:/@]*@/, ':***@'));
console.log('Node version:', process.version);
console.log('OpenSSL version:', process.versions.openssl);
console.log('');

(async () => {
  try {
    console.log('Attempting connection...');
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 5000,
    });
    console.log('✅ Connected successfully!');
    console.log('Database:', mongoose.connection.name);
    console.log('Host:', mongoose.connection.host);
    await mongoose.disconnect();
    console.log('✅ Disconnected cleanly');
  } catch (err) {
    console.error('\n❌ Connection failed:\n');
    console.error('Error type:', err.name);
    console.error('Error message:', err.message);
    if (err.reason) console.error('Reason:', err.reason);
    console.error('\nFull error:', err);
    process.exit(1);
  }
})();
