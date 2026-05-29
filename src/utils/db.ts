import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';

// Configure dynamic database location on Vercel
if (process.env.VERCEL) {
  const tmpDbPath = '/tmp/dev.db';
  const bundledDbPath = path.join(process.cwd(), 'prisma', 'dev.db');
  
  process.env.DATABASE_URL = `file:${tmpDbPath}`;
  
  try {
    if (!fs.existsSync(tmpDbPath)) {
      console.log('Copying bundled SQLite database to /tmp...');
      if (fs.existsSync(bundledDbPath)) {
        fs.copyFileSync(bundledDbPath, tmpDbPath);
        fs.chmodSync(tmpDbPath, 0o666); // Make sure it's read/writeable
        console.log('Database successfully copied to /tmp!');
      } else {
        console.warn('Bundled database template not found at:', bundledDbPath);
      }
    }
  } catch (error) {
    console.error('Failed to copy database to /tmp:', error);
  }
} else {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'file:./dev.db';
  }
}

const prisma = new PrismaClient();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

let redis: any;
let redisSubscriber: any;

let useRealRedis = false;

try {
  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 500,
    retryStrategy: () => null
  });
  
  redis.on('ready', () => {
    console.log('⚡ Connected to Redis server successfully!');
    useRealRedis = true;
  });

  redis.on('error', (err: any) => {
    // Suppress console error trace
  });

  redisSubscriber = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 500,
    retryStrategy: () => null
  });

  redisSubscriber.on('error', (err: any) => {
    // Suppress console error trace
  });
} catch (e) {
  // Suppress
}

// In-memory mock fallback store
const mockMemoryStore = new Map<string, string>();
const mockSets = new Map<string, Set<string>>();

const mockRedisClient: any = {
  on: (event: string, callback: Function) => {},
  psubscribe: (pattern: string, channel: string, callback?: Function) => {
    if (callback) callback(null);
  },
  set: async (key: string, value: string, mode?: string, ttl?: number) => {
    mockMemoryStore.set(key, value);
    return 'OK';
  },
  get: async (key: string) => {
    return mockMemoryStore.get(key) || null;
  },
  sismember: async (setName: string, value: string) => {
    const s = mockSets.get(setName);
    return s && s.has(value) ? 1 : 0;
  },
  sadd: async (setName: string, value: string) => {
    if (!mockSets.has(setName)) {
      mockSets.set(setName, new Set());
    }
    mockSets.get(setName)!.add(value);
    return 1;
  },
  expire: async (setName: string, ttl: number) => 1,
  del: async (key: string) => {
    mockMemoryStore.delete(key);
    return 1;
  },
  publish: async (channel: string, message: string) => 1
};

const redisHandler = {
  get: (target: any, prop: string) => {
    if (!useRealRedis) {
      return mockRedisClient[prop] || (() => Promise.resolve(null));
    }
    return target ? target[prop] : mockRedisClient[prop];
  }
};

const proxiedRedis = new Proxy(redis, redisHandler);
const proxiedSubscriber = new Proxy(redisSubscriber, redisHandler);

export { prisma, proxiedRedis as redis, proxiedSubscriber as redisSubscriber };
