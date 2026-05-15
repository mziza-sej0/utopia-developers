# Utopia Developers — Backend API

Node.js / Express REST API backing the Utopia Developers frontend.

---

## Project Structure

```
utopia-backend/
├── src/
│   ├── server.js            # Entry point, middleware, route mounting
│   ├── db.js                # In-memory store (swap for real DB)
│   ├── routes/
│   │   ├── auth.js          # Register, login, Google OAuth, password reset
│   │   └── contact.js       # Contact form + message log
│   ├── middleware/
│   │   └── auth.js          # JWT verification middleware
│   └── config/
│       └── mailer.js        # Nodemailer transporter + email templates
├── js/
│   └── api.js               # ← Copy this into your frontend's /js folder
├── .env.example
├── package.json
└── README.md
```

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET
```

### 3. Run the server
```bash
# Development (with auto-reload via nodemon)
npm run dev

# Production
npm start
```

The API starts on **http://localhost:3000** by default.

### 4. Wire up the frontend
Copy `js/api.js` into your frontend project so both `login.html` and `contact.html` can find it:
```
your-site/
├── js/
│   └── api.js    ← copy here
├── login.html
├── contact.html
└── ...
```

---

## API Endpoints

### Auth — `/api/auth`

| Method | Path | Body | Auth Required | Description |
|--------|------|------|---------------|-------------|
| POST | `/register` | `name, email, password` | No | Create account |
| POST | `/login` | `email, password` | No | Sign in, returns JWT |
| POST | `/google` | `token` | No | Google OAuth sign-in |
| POST | `/forgot-password` | `email` | No | Send password reset email |
| POST | `/reset-password` | `token, password` | No | Apply password reset |
| GET | `/me` | — | Yes | Get current user profile |
| POST | `/logout` | — | Yes | Invalidate session (client clears token) |

### Contact — `/api/contact`

| Method | Path | Body | Auth Required | Description |
|--------|------|------|---------------|-------------|
| POST | `/` | `name, email, subject, message, subscribe` | No | Submit contact form |
| GET | `/` | — | X-Admin-Key header | View all messages |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server status check |

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Server port |
| `NODE_ENV` | No | `development` | Environment |
| `JWT_SECRET` | **Yes** | — | Secret for signing JWTs |
| `JWT_EXPIRES_IN` | No | `7d` | Token lifetime |
| `EMAIL_HOST` | No | `smtp.gmail.com` | SMTP host |
| `EMAIL_PORT` | No | `587` | SMTP port |
| `EMAIL_USER` | No | — | SMTP username (uses Ethereal if unset) |
| `EMAIL_PASS` | No | — | SMTP password / app password |
| `EMAIL_FROM` | No | — | Sender display name + address |
| `GOOGLE_CLIENT_ID` | No | — | Google OAuth client ID |
| `CLIENT_URL` | No | `*` | Frontend origin for CORS |
| `ADMIN_KEY` | No | — | Header key for viewing contact messages |

> **Email in development**: If `EMAIL_USER` is not set, the server automatically creates an [Ethereal](https://ethereal.email) test account. Preview URLs for sent emails are logged to the console — no real emails are delivered.

---

## Connecting a Real Database

The in-memory store (`src/db.js`) is intentionally simple. To use a real database:

**MongoDB (Mongoose)**
```bash
npm install mongoose
```
Replace the `users` Map with a Mongoose `User` model. The route files need no other changes.

**PostgreSQL (Prisma)**
```bash
npm install @prisma/client
npx prisma init
```
Define a `User` model in `prisma/schema.prisma` and swap calls in `auth.js`.

---

## Security Notes

- Passwords are hashed with **bcrypt** (cost factor 12)
- JWT tokens expire after 7 days (configurable)
- Auth routes are rate-limited to **10 requests / 15 min**
- Contact form is rate-limited to **5 messages / hour**
- Honeypot field (`_hp`) silently discards bot submissions
- Password reset tokens expire in **1 hour**
- CORS origin should be tightened to your domain in production

---

## Upgrading to Production Checklist

- [ ] Set a strong `JWT_SECRET` (32+ random characters)
- [ ] Set `NODE_ENV=production`
- [ ] Configure real SMTP credentials
- [ ] Replace in-memory store with a persistent database
- [ ] Set `CLIENT_URL` to your actual frontend domain
- [ ] Run behind HTTPS (nginx, Caddy, or a PaaS like Railway/Render)
- [ ] Set `GOOGLE_CLIENT_ID` if using Google OAuth
