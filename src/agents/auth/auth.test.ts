import request from 'supertest';
import { app, server } from '../../index';
import { prisma, redis, redisSubscriber } from '../../utils/db';
import { encryptIdentity } from '../../utils/crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey1234567890123456';

describe('Auth & Identity Agent Integration Tests', () => {
  let adminUser: any;
  let clientUser: any;
  let adminAccessToken: string;

  async function clearDb() {
    await prisma.fileAccessLog.deleteMany({});
    await prisma.fileRecord.deleteMany({});
    await prisma.message.deleteMany({});
    await prisma.channel.deleteMany({});
    await prisma.projectAssignment.deleteMany({});
    await prisma.project.deleteMany({});
    await prisma.refreshToken.deleteMany({});
    await prisma.identityMapping.deleteMany({});
    await prisma.user.deleteMany({});
  }

  beforeAll(async () => {
    // Make sure Prisma and Redis are connected/ready
  });

  afterAll(async () => {
    // Cleanup and close all connections to avoid open handles
    await clearDb();
    await prisma.$disconnect();
    await redis.quit();
    await redisSubscriber.quit();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  beforeEach(async () => {
    await clearDb();
    await redis.flushdb();

    // Create Admin User
    const adminPasswordHash = await bcrypt.hash('adminpassword', 10);
    adminUser = await prisma.user.create({
      data: {
        systemId: 'ADM-001',
        role: 'ADMIN',
        status: 'ACTIVE',
        passwordHash: adminPasswordHash,
      },
    });

    const adminIdentity = encryptIdentity('Admin User', 'admin@example.com');
    await prisma.identityMapping.create({
      data: {
        userId: adminUser.id,
        encryptedData: adminIdentity.encryptedData,
        iv: adminIdentity.iv,
        authTag: adminIdentity.authTag,
      },
    });

    // Create Client User
    const clientPasswordHash = await bcrypt.hash('clientpassword', 10);
    clientUser = await prisma.user.create({
      data: {
        systemId: 'CLT-001',
        role: 'CLIENT',
        status: 'ACTIVE',
        passwordHash: clientPasswordHash,
      },
    });

    const clientIdentity = encryptIdentity('Client User', 'client@example.com');
    await prisma.identityMapping.create({
      data: {
        userId: clientUser.id,
        encryptedData: clientIdentity.encryptedData,
        iv: clientIdentity.iv,
        authTag: clientIdentity.authTag,
      },
    });

    // Authenticate Admin to get token for offboarding
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'adminpassword' });

    adminAccessToken = loginRes.body.accessToken;
  });

  // (1) POST /auth/login with valid credentials returns {accessToken, refreshToken} where both are valid tokens.
  test('(1) POST /auth/login with valid credentials returns valid tokens', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'client@example.com', password: 'clientpassword' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');

    // Verify accessToken is a valid JWT
    const decoded = jwt.verify(res.body.accessToken, JWT_SECRET) as any;
    expect(decoded).toHaveProperty('userId', clientUser.id);
    expect(decoded).toHaveProperty('role', 'CLIENT');

    // Verify refreshToken is a non-empty string
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.refreshToken.length).toBeGreaterThan(0);
  });

  // (2) Any request with an expired access token returns 401 with {error: 'Token expired'}.
  test('(2) Any request with an expired access token returns 401 Token expired', async () => {
    // Generate an expired access token
    const expiredToken = jwt.sign(
      {
        userId: clientUser.id,
        systemId: clientUser.systemId,
        role: clientUser.role,
        jti: 'test-expired-jti',
      },
      JWT_SECRET,
      { expiresIn: '-1s' }
    );

    const res = await request(app)
      .get('/admin/users')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Token expired' });
  });

  // (3) POST /auth/refresh returns a new token pair and the old refreshToken row in DB has been deleted.
  test('(3) POST /auth/refresh returns new tokens and deletes the old one', async () => {
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'client@example.com', password: 'clientpassword' });

    const oldRefreshToken = loginRes.body.refreshToken;

    // Verify it exists in DB
    const dbTokenBefore = await prisma.refreshToken.findUnique({
      where: { token: oldRefreshToken },
    });
    expect(dbTokenBefore).not.toBeNull();

    // Call refresh
    const refreshRes = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: oldRefreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body).toHaveProperty('accessToken');
    expect(refreshRes.body).toHaveProperty('refreshToken');
    expect(refreshRes.body.refreshToken).not.toBe(oldRefreshToken);

    // Verify old token is deleted from DB
    const dbTokenAfter = await prisma.refreshToken.findUnique({
      where: { token: oldRefreshToken },
    });
    expect(dbTokenAfter).toBeNull();
  });

  // (4) POST /auth/refresh again with the rotated-out (now deleted) refresh token returns 401.
  test('(4) POST /auth/refresh with rotated-out refresh token returns 401', async () => {
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'client@example.com', password: 'clientpassword' });

    const oldRefreshToken = loginRes.body.refreshToken;

    // Refresh once (this deletes/rotates the token)
    await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: oldRefreshToken });

    // Refresh again with same old token
    const secondRefreshRes = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: oldRefreshToken });

    expect(secondRefreshRes.status).toBe(401);
  });

  // (5) POST /admin/offboard then POST /auth/refresh with that user's refresh token returns 401.
  test("(5) POST /admin/offboard revokes refresh tokens and prevents refreshing", async () => {
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'client@example.com', password: 'clientpassword' });

    const clientRefreshToken = loginRes.body.refreshToken;

    // Admin offboards client
    const offboardRes = await request(app)
      .post('/admin/offboard')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ userId: clientUser.id });

    expect(offboardRes.status).toBe(200);

    // Client tries to refresh
    const refreshRes = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: clientRefreshToken });

    expect(refreshRes.status).toBe(401);
  });

  // (6) POST /admin/offboard then make a request with the user's still-valid access token — returns 401 because jti is in Redis blacklist.
  test('(6) POST /admin/offboard blacklists current jti and rejects still-valid access token', async () => {
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'client@example.com', password: 'clientpassword' });

    const clientAccessToken = loginRes.body.accessToken;

    // Admin offboards client (this adds the JTI of clientAccessToken to blacklist)
    const offboardRes = await request(app)
      .post('/admin/offboard')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ userId: clientUser.id });

    expect(offboardRes.status).toBe(200);

    // Try accessing a protected route with the client's access token
    const res = await request(app)
      .get('/admin/users') // requires ADMIN but blacklist check runs first!
      .set('Authorization', `Bearer ${clientAccessToken}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Token has been blacklisted (revoked)' });
  });
});
