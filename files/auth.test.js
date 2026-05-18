import express from 'express';
import request from 'supertest';
import { compare, hash } from 'bcryptjs';
import authRouter from './routes/auth';
import { users, resetTokens } from '../db';
import { sendPasswordResetEmail } from '../config/mailer';

// ─── Mock Dependencies ───────────────────────────────────────────────────────

jest.mock('../db', () => ({
  users: {
    has: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  },
  resetTokens: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../config/mailer', () => ({
  sendPasswordResetEmail: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_mock_password'),
  compare: jest.fn(),
}));

// Extracting mockVerifyIdToken to control its return value per test
const mockVerifyIdToken = jest.fn();
jest.mock('google-auth-library', () => {
  return {
    OAuth2Client: jest.fn().mockImplementation(() => ({
      verifyIdToken: mockVerifyIdToken,
    })),
  };
});

jest.mock('../middleware/auth', () => ({
  authenticate: jest.fn((req, res, next) => {
    // Mocking an authenticated user session
    req.user = { email: 'test@example.com', id: 'mock-id' };
    next();
  }),
}));

// ─── App Setup ───────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

describe('Auth API Routes', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'super-secret-test-key';
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── POST /api/auth/register ───────────────────────────────────────────────
  describe('POST /api/auth/register', () => {
    it('should return 400 if required fields are missing', async () => {
      const res = await request(app).post('/api/auth/register').send({ name: 'John' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 if password is less than 8 characters', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'John',
        email: 'john@example.com',
        password: 'short',
      });
      expect(res.status).toBe(400);
    });

    it('should return 409 if email is already registered', async () => {
      users.has.mockReturnValueOnce(true);

      const res = await request(app).post('/api/auth/register').send({
        name: 'John',
        email: 'john@example.com',
        password: 'validpassword',
      });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('should register successfully and return a token', async () => {
      users.has.mockReturnValueOnce(false);

      const res = await request(app).post('/api/auth/register').send({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'validpassword',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.passwordHash).toBeUndefined(); // Should omit password from output
      expect(users.set).toHaveBeenCalledTimes(1);
    });
  });

  // ─── POST /api/auth/login ──────────────────────────────────────────────────
  describe('POST /api/auth/login', () => {
    it('should return 401 for an unknown user', async () => {
      users.get.mockReturnValueOnce(null);

      const res = await request(app).post('/api/auth/login').send({
        email: 'nobody@example.com',
        password: 'password123',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 if passwords do not match', async () => {
      users.get.mockReturnValueOnce({ provider: 'local', passwordHash: 'hashed_pw' });
      compare.mockResolvedValueOnce(false);

      const res = await request(app).post('/api/auth/login').send({
        email: 'user@example.com',
        password: 'wrongpassword',
      });

      expect(res.status).toBe(401);
    });

    it('should return 200 and a token on successful login', async () => {
      users.get.mockReturnValueOnce({
        id: '123',
        email: 'user@example.com',
        provider: 'local',
        passwordHash: 'hashed_pw',
      });
      compare.mockResolvedValueOnce(true); // Password match

      const res = await request(app).post('/api/auth/login').send({
        email: 'user@example.com',
        password: 'correctpassword',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
    });
  });

  // ─── POST /api/auth/google ─────────────────────────────────────────────────
  describe('POST /api/auth/google', () => {
    it('should return 400 if Google token is missing', async () => {
      const res = await request(app).post('/api/auth/google').send({});
      expect(res.status).toBe(400);
    });

    it('should verify the token, create a user if missing, and return JWT', async () => {
      mockVerifyIdToken.mockResolvedValueOnce({
        getPayload: () => ({ email: 'google@example.com', name: 'G User', picture: 'pic.png' }),
      });
      users.get.mockReturnValueOnce(null); // Simulate new user

      const res = await request(app).post('/api/auth/google').send({ token: 'mock-google-token' });

      expect(res.status).toBe(200);
      expect(users.set).toHaveBeenCalledTimes(1);
      expect(res.body.token).toBeDefined();
    });
  });

  // ─── POST /api/auth/forgot-password ────────────────────────────────────────
  describe('POST /api/auth/forgot-password', () => {
    it('should return 200 without revealing if email exists (prevent enumeration)', async () => {
      users.get.mockReturnValueOnce(null);

      const res = await request(app).post('/api/auth/forgot-password').send({
        email: 'nonexistent@example.com',
      });

      expect(res.status).toBe(200);
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should generate a token and send an email if user exists', async () => {
      users.get.mockReturnValueOnce({ email: 'user@example.com', name: 'User', provider: 'local' });

      const res = await request(app).post('/api/auth/forgot-password').send({
        email: 'user@example.com',
      });

      expect(res.status).toBe(200);
      expect(resetTokens.set).toHaveBeenCalledTimes(1);
      expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    });
  });

  // ─── POST /api/auth/reset-password ─────────────────────────────────────────
  describe('POST /api/auth/reset-password', () => {
    it('should return 400 for an invalid or expired token', async () => {
      resetTokens.get.mockReturnValueOnce(null);

      const res = await request(app).post('/api/auth/reset-password').send({
        token: 'invalid-token',
        password: 'newpassword123',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid or has expired/);
    });

    it('should reset password successfully and delete the token', async () => {
      resetTokens.get.mockReturnValueOnce({ email: 'user@example.com', expires: Date.now() + 10000 });
      users.get.mockReturnValueOnce({ email: 'user@example.com', passwordHash: 'old_hash' });

      const res = await request(app).post('/api/auth/reset-password').send({
        token: 'valid-token',
        password: 'newpassword123',
      });

      expect(res.status).toBe(200);
      expect(users.set).toHaveBeenCalled();
      expect(resetTokens.delete).toHaveBeenCalledWith('valid-token');
    });
  });

  // ─── GET /api/auth/me ──────────────────────────────────────────────────────
  describe('GET /api/auth/me', () => {
    it('should retrieve safe current user profile', async () => {
      // Middleware mock sets req.user.email to test@example.com
      users.get.mockReturnValueOnce({ email: 'test@example.com', name: 'Test User' });

      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Test User');
    });
  });
});