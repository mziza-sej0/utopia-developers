# Database Setup Guide

## MongoDB Installation & Connection

### 1. Install MongoDB

**Local installation:**
```bash
# macOS (Homebrew)
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community

# Ubuntu/Debian
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update && sudo apt-get install -y mongodb-org
sudo systemctl start mongod
```

**Or use MongoDB Atlas (cloud):**
- Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
- Create a free cluster
- Get connection string: `mongodb+srv://jose:<200507One9.>@cluster0.z1fdr08.mongodb.net/`

### 2. Set Environment Variables

Create `.env` file in your `files/` directory:
```env
MONGODB_URI=mongodb://localhost:27017/utopia-developers
```

Or for MongoDB Atlas:
```env
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/utopia-developers
```

### 3. Install Dependencies

```bash
cd /home/sejoo/Documents/utopia\ developers/files
npm install mongoose express-rate-limit dotenv
```

### 4. Start the Server

```bash
node server.js
```

Expected output:
```
✓ MongoDB connected
╔══════════════════════════════════════════╗
║   🚀  Utopia Developers API running      ║
║   Port    : 3000                         ║
║   Env     : development                  ║
╚══════════════════════════════════════════╝
```

## Database Structure

The Mongoose adapter provides:

- **`users`** — Stores user accounts (email, name, password hash, OAuth info)
- **`resetTokens`** — Temporary password reset tokens (auto-expires after 10 min)
- **`contactMessages`** — Contact form submissions with status tracking

## Querying the Database

### From Routes (no changes needed):

```javascript
const { users, resetTokens, contactMessages } = require('./db');

// Create/update user
await users.set(email, { name: 'Alice', password: hashedPwd });

// Get user
const user = await users.get('alice@example.com');

// Store reset token
await resetTokens.set(token, { email: 'alice@example.com' });

// Add contact message
await contactMessages.push({ name, email, subject, message });
```

## Switching DB Implementations

To swap to PostgreSQL, MySQL, or Prisma later:

1. Create a new adapter file (e.g., `db-prisma.js`)
2. Export the same interface (`users`, `resetTokens`, `contactMessages`)
3. Update `server.js` import: `const { connectDB, users, ... } = require('./db-prisma');`
4. **No route files need to change!**

## Troubleshooting

**"Cannot find module 'mongoose'"**
```bash
npm install mongoose
```

**"MongoServerError: connect ECONNREFUSED"**
- MongoDB is not running. Start it with `mongod` or use MongoDB Atlas

**"Authentication failed"**
- Check your MONGODB_URI credentials in `.env`
- For Atlas, whitelist your IP address in cluster settings

**"Timezone mismatch" errors**
- All timestamps use UTC by default in Mongoose — this is normal
