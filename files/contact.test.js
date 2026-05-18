import express from 'express';
import request from 'supertest';
import contactRouter from './contact';
import { contactMessages } from '../db';
import { sendContactEmail } from '../config/mailer';

// Mock dependencies
jest.mock('../db', () => ({
  contactMessages: {
    push: jest.fn(),
    getAll: jest.fn(),
  },
}));

jest.mock('../config/mailer', () => ({
  sendContactEmail: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use('/api/contact', contactRouter);

describe('Contact API Routes', () => {
  beforeAll(() => {
    process.env.ADMIN_KEY = 'test-secret-key';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/contact', () => {
    it('should return 400 if required fields are missing', async () => {
      const res = await request(app).post('/api/contact').send({ name: 'Jane Doe' });
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/required/);
    });

    it('should return 400 for an invalid email format', async () => {
      const res = await request(app).post('/api/contact').send({
        name: 'Jane Doe',
        email: 'invalid-email-address',
        message: 'Hello, world!',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/valid email/);
    });

    it('should silently succeed and exit early if the honeypot (_hp) is filled', async () => {
      const res = await request(app).post('/api/contact').send({
        name: 'Spam Bot',
        email: 'bot@example.com',
        message: 'Buy my product!',
        _hp: '1',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(contactMessages.push).not.toHaveBeenCalled();
      expect(sendContactEmail).not.toHaveBeenCalled();
    });

    it('should save the message and send an email on valid submission', async () => {
      contactMessages.push.mockResolvedValueOnce({ _id: '123' });
      sendContactEmail.mockResolvedValueOnce();

      const res = await request(app).post('/api/contact').send({
        name: 'John Doe',
        email: 'john@example.com',
        subject: 'General Inquiry',
        message: 'I have a question.',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(contactMessages.push).toHaveBeenCalledTimes(1);
      expect(sendContactEmail).toHaveBeenCalledTimes(1);
    });

    it('should return 500 if the database or mailer fails', async () => {
      contactMessages.push.mockRejectedValueOnce(new Error('DB Error'));

      const res = await request(app).post('/api/contact').send({
        name: 'John Doe',
        email: 'john@example.com',
        message: 'Fail me',
      });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/contact', () => {
    it('should return 403 Forbidden if admin key is invalid or missing', async () => {
      const res = await request(app).get('/api/contact').set('x-admin-key', 'wrong-key');
      expect(res.status).toBe(403);
    });

    it('should return 200 with contact messages if the admin key is valid', async () => {
      const mockData = [{ name: 'Msg 1' }, { name: 'Msg 2' }];
      contactMessages.getAll.mockResolvedValueOnce(mockData);

      const res = await request(app).get('/api/contact').set('x-admin-key', 'test-secret-key');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.total).toBe(2);
      expect(res.body.messages).toEqual(mockData);
    });
  });
});