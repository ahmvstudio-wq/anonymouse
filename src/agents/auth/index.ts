import { Request, Response, NextFunction, Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma, redis } from '../../utils/db';
import { decryptIdentity } from '../../utils/crypto';
export type Role = 'ADMIN' | 'AGENT' | 'CLIENT';

export interface AuthUser {
  userId: string;
  systemId: string;
  role: Role;
  jti: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey1234567890123456';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'supersecretrefreshkey1234567890123456';

// 1. POST /auth/login
authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Since emails are encrypted inside IdentityMapping, we fetch all IdentityMappings and decrypt them
    // to find the matching user. For production this would use an email hash lookup, but we perform
    // the in-memory search for exact compliance with storing only encrypted AES-256-GCM data.
    const mappings = await prisma.identityMapping.findMany({
      include: { user: true }
    });

    let foundUser = null;
    for (const mapping of mappings) {
      try {
        const decrypted = decryptIdentity(
          Buffer.from(mapping.encryptedData),
          Buffer.from(mapping.iv),
          Buffer.from(mapping.authTag)
        );
        if (decrypted.email.toLowerCase() === email.toLowerCase()) {
          foundUser = mapping.user;
          break;
        }
      } catch (err) {
        // Skip decryption failures for individual keys in case of corruption
        console.error('Decryption failed for mapping id:', mapping.id, err);
      }
    }

    if (!foundUser) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Verify bcrypt password
    const isPasswordValid = await bcrypt.compare(password, foundUser.passwordHash);
    if (!isPasswordValid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Check status is ACTIVE
    if (foundUser.status !== 'ACTIVE') {
      res.status(401).json({ error: 'User account is terminated or inactive' });
      return;
    }

    // Issue access + refresh tokens
    const jti = crypto.randomUUID();
    const accessToken = jwt.sign(
      {
        userId: foundUser.id,
        systemId: foundUser.systemId,
        role: foundUser.role,
        jti,
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Issue refresh token
    const refreshTokenString = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        userId: foundUser.id,
        token: refreshTokenString,
        expiresAt,
      },
    });

    // Store the jti in Redis key user:{userId}:jti with TTL 900 (15 min)
    await redis.set(`user:${foundUser.id}:jti`, jti, 'EX', 900);

    res.json({
      accessToken,
      refreshToken: refreshTokenString,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. POST /auth/refresh
authRouter.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token is required' });
      return;
    }

    // Find token in DB
    const dbToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!dbToken) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    // Check not revoked and not expired
    if (dbToken.revokedAt !== null || dbToken.expiresAt < new Date()) {
      res.status(401).json({ error: 'Revoked or expired refresh token' });
      return;
    }

    const foundUser = dbToken.user;

    // Check status is ACTIVE
    if (foundUser.status !== 'ACTIVE') {
      res.status(401).json({ error: 'User account is terminated or inactive' });
      return;
    }

    // Delete the old refresh token (rotate)
    await prisma.refreshToken.delete({
      where: { id: dbToken.id },
    });

    // Issue new pair
    const jti = crypto.randomUUID();
    const accessToken = jwt.sign(
      {
        userId: foundUser.id,
        systemId: foundUser.systemId,
        role: foundUser.role,
        jti,
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    const newRefreshTokenString = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        userId: foundUser.id,
        token: newRefreshTokenString,
        expiresAt,
      },
    });

    // Store the new jti in Redis key user:{userId}:jti with TTL 900 (15 min)
    await redis.set(`user:${foundUser.id}:jti`, jti, 'EX', 900);

    res.json({
      accessToken,
      refreshToken: newRefreshTokenString,
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Export middleware requireAuth(roles: Role[])
export function requireAuth(roles: Role[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No authorization token provided' });
        return;
      }

      const token = authHeader.split(' ')[1];
      let decoded: any;

      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err: any) {
        if (err.name === 'TokenExpiredError') {
          res.status(401).json({ error: 'Token expired' });
          return;
        }
        res.status(401).json({ error: 'Invalid token signature' });
        return;
      }

      const { userId, systemId, role, jti } = decoded;

      // Check jti not in Redis Set 'jti:blacklist'
      const isBlacklisted = await redis.sismember('jti:blacklist', jti);
      if (isBlacklisted) {
        res.status(401).json({ error: 'Token has been blacklisted (revoked)' });
        return;
      }

      // Check role is in the allowed list
      if (!roles.includes(role)) {
        res.status(403).json({ error: 'Access denied: insufficient permissions' });
        return;
      }

      // Attach decoded payload to req.user
      req.user = {
        userId,
        systemId,
        role,
        jti,
      };

      next();
    } catch (error) {
      console.error('requireAuth error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

const adminRouter = Router();

adminRouter.post('/onboard', requireAuth(['ADMIN']), async (req: Request, res: Response): Promise<void> => {
  try {
    const { role, name, email, password } = req.body;

    if (!role || !name || !email) {
      res.status(400).json({ error: 'Role, name, and email are required' });
      return;
    }

    if (role !== 'AGENT' && role !== 'CLIENT') {
      res.status(400).json({ error: 'Role must be AGENT or CLIENT' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Query the max numeric suffix of existing systemIds for that role
      const users = await tx.user.findMany({
        where: { role },
        select: { systemId: true }
      });

      const prefix = role === 'AGENT' ? 'AGT' : 'CLT';
      let maxSuffix = 0;

      for (const u of users) {
        if (u.systemId.startsWith(`${prefix}-`)) {
          const suffixStr = u.systemId.split('-')[1];
          const suffix = parseInt(suffixStr, 10);
          if (!isNaN(suffix) && suffix > maxSuffix) {
            maxSuffix = suffix;
          }
        }
      }

      const nextSuffix = maxSuffix + 1;
      const systemId = `${prefix}-${String(nextSuffix).padStart(3, '0')}`;

      // Get or generate password hash
      const passwordToHash = password || 'TemporaryPassword123!';
      const passwordHash = await bcrypt.hash(passwordToHash, 10);

      // 2. Create User
      const user = await tx.user.create({
        data: {
          systemId,
          role,
          status: 'ACTIVE',
          passwordHash
        }
      });

      // 3. Encrypt name and email
      const keyHex = process.env.IDENTITY_ENCRYPTION_KEY;
      if (!keyHex || keyHex.length !== 64) {
        throw new Error('IDENTITY_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
      }
      const key = Buffer.from(keyHex, 'hex');
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      
      const identityData = JSON.stringify({ name, email });
      const encryptedData = Buffer.concat([
        cipher.update(identityData, 'utf8'),
        cipher.final()
      ]);
      const authTag = cipher.getAuthTag();

      // 4. Create IdentityMapping
      await tx.identityMapping.create({
        data: {
          userId: user.id,
          encryptedData,
          iv,
          authTag
        }
      });

      return { systemId, role };
    });

    res.json(result);
  } catch (error) {
    console.error('Onboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

adminRouter.post('/offboard', requireAuth(['ADMIN']), async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.body;

    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // (1) Update User.status to TERMINATED in Prisma.
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'TERMINATED' }
    });

    // (2) Update all RefreshTokens for that userId: set revokedAt = now.
    await prisma.refreshToken.updateMany({
      where: { userId },
      data: { revokedAt: new Date() }
    });

    // (3) Fetch the stored jti from Redis key user:{userId}:jti.
    const redisJtiKey = `user:${userId}:jti`;
    const jti = await redis.get(redisJtiKey);

    // (4) If jti exists: add it to Redis Set 'jti:blacklist' using SADD, then call EXPIRE on 'jti:blacklist' to reset TTL to 900 seconds.
    if (jti) {
      await redis.sadd('jti:blacklist', jti);
      await redis.expire('jti:blacklist', 900);
    }

    // (5) Delete the Redis key user:{userId}:jti.
    await redis.del(redisJtiKey);

    res.json({ success: true, systemId: user.systemId });
  } catch (error) {
    console.error('Offboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { authRouter, adminRouter };
