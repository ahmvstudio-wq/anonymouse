import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { app, server } from '../../index';
import { prisma, redis, redisSubscriber } from '../../utils/db';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey1234567890123456';

describe('Messaging Engine Integration Tests', () => {
  let port: number;
  let serverUrl: string;

  let agentUser: any;
  let clientUser: any;
  let otherAgentUser: any;

  let project1: any;
  let project2: any;
  let channel1: any;
  let channel2: any;

  let agentToken: string;
  let clientToken: string;
  let otherAgentToken: string;

  let agentSocket: ClientSocket;
  let clientSocket: ClientSocket;
  let otherAgentSocket: ClientSocket;

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

  function generateToken(user: any) {
    return jwt.sign(
      {
        userId: user.id,
        systemId: user.systemId,
        role: user.role,
        jti: crypto.randomUUID(),
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
  }

  beforeAll(async () => {
    // Start server on a dynamic port
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        port = typeof address === 'string' ? 3000 : address?.port || 3000;
        serverUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Close Sockets
    if (agentSocket && agentSocket.connected) agentSocket.disconnect();
    if (clientSocket && clientSocket.connected) clientSocket.disconnect();
    if (otherAgentSocket && otherAgentSocket.connected) otherAgentSocket.disconnect();

    // Cleanup Database and Close Server Connections
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

    const passwordHash = await bcrypt.hash('testpassword', 10);

    // Create Agent User
    agentUser = await prisma.user.create({
      data: {
        systemId: 'AGT-001',
        role: 'AGENT',
        status: 'ACTIVE',
        passwordHash,
      },
    });

    // Create Client User
    clientUser = await prisma.user.create({
      data: {
        systemId: 'CLT-001',
        role: 'CLIENT',
        status: 'ACTIVE',
        passwordHash,
      },
    });

    // Create Another Agent User for different project
    otherAgentUser = await prisma.user.create({
      data: {
        systemId: 'AGT-002',
        role: 'AGENT',
        status: 'ACTIVE',
        passwordHash,
      },
    });

    // Create Project 1 and Channel 1
    project1 = await prisma.project.create({
      data: {
        name: 'Project 1',
        clientId: clientUser.id,
      },
    });

    channel1 = await prisma.channel.create({
      data: {
        projectId: project1.id,
      },
    });

    // Assign Agent 1 and Client to Project 1
    await prisma.projectAssignment.createMany({
      data: [
        { projectId: project1.id, userId: agentUser.id },
        { projectId: project1.id, userId: clientUser.id },
      ],
    });

    // Create Project 2 and Channel 2 (for separate tenant isolation checks)
    project2 = await prisma.project.create({
      data: {
        name: 'Project 2',
        clientId: clientUser.id,
      },
    });

    channel2 = await prisma.channel.create({
      data: {
        projectId: project2.id,
      },
    });

    // Assign Agent 2 to Project 2
    await prisma.projectAssignment.create({
      data: { projectId: project2.id, userId: otherAgentUser.id },
    });

    // Generate JWTs
    agentToken = generateToken(agentUser);
    clientToken = generateToken(clientUser);
    otherAgentToken = generateToken(otherAgentUser);
  });

  test('should handle the full message flow with room isolation and PII redaction', async () => {
    // (1) Connect two sockets (agent and client) for Project 1, and one socket (agent 2) for Project 2
    agentSocket = ioClient(serverUrl, {
      auth: { token: agentToken },
      transports: ['websocket'],
    });

    clientSocket = ioClient(serverUrl, {
      auth: { token: clientToken },
      transports: ['websocket'],
    });

    otherAgentSocket = ioClient(serverUrl, {
      auth: { token: otherAgentToken },
      transports: ['websocket'],
    });

    // Wait for all sockets to connect
    await Promise.all([
      new Promise<void>((res) => agentSocket.on('connect', res)),
      new Promise<void>((res) => clientSocket.on('connect', res)),
      new Promise<void>((res) => otherAgentSocket.on('connect', res)),
    ]);

    // Join channels
    agentSocket.emit('channel:join', { projectId: project1.id });
    clientSocket.emit('channel:join', { projectId: project1.id });
    otherAgentSocket.emit('channel:join', { projectId: project2.id });

    // Wait for channel join confirmation
    await Promise.all([
      new Promise<void>((res) => agentSocket.on('channel:joined', () => res())),
      new Promise<void>((res) => clientSocket.on('channel:joined', () => res())),
      new Promise<void>((res) => otherAgentSocket.on('channel:joined', () => res())),
    ]);

    // Setup listeners to verify messages received
    const agentMsgs: any[] = [];
    const clientMsgs: any[] = [];
    const otherAgentMsgs: any[] = [];

    agentSocket.on('message:new', (msg) => agentMsgs.push(msg));
    clientSocket.on('message:new', (msg) => clientMsgs.push(msg));
    otherAgentSocket.on('message:new', (msg) => otherAgentMsgs.push(msg));

    // (2) Agent sends a clean message
    const cleanSendPromise = new Promise<void>((resolve) => {
      let ackReceived = false;
      let agentReceived = false;
      let clientReceived = false;

      agentSocket.emit('message:send', { content: 'Hello client!' });

      agentSocket.on('message:ack', (data) => {
        expect(data).toHaveProperty('success', true);
        ackReceived = true;
        if (ackReceived && agentReceived && clientReceived) resolve();
      });

      // We need to wait for message:new events on both sockets
      const checkResolve = () => {
        if (ackReceived && agentReceived && clientReceived) resolve();
      };

      agentSocket.on('message:new', (msg) => {
        if (msg.content === 'Hello client!') {
          agentReceived = true;
          checkResolve();
        }
      });

      clientSocket.on('message:new', (msg) => {
        if (msg.content === 'Hello client!') {
          clientReceived = true;
          checkResolve();
        }
      });
    });

    await cleanSendPromise;

    // Clean up temporary listeners to avoid pollution
    agentSocket.removeAllListeners('message:ack');
    agentSocket.removeAllListeners('message:new');
    clientSocket.removeAllListeners('message:new');

    // Register primary listeners again
    agentSocket.on('message:new', (msg) => agentMsgs.push(msg));
    clientSocket.on('message:new', (msg) => clientMsgs.push(msg));

    // (3) Agent sends a message containing a phone number
    const piiSendPromise = new Promise<void>((resolve) => {
      let redactedEventReceived = false;
      let ackReceived = false;
      let agentReceived = false;
      let clientReceived = false;

      agentSocket.emit('message:send', { content: 'Call me at 9876543210' });

      agentSocket.on('message:redacted', (data) => {
        expect(data.types).toContain('INDIAN_PHONE');
        expect(data.notice).toBe('Your message was edited by the system');
        redactedEventReceived = true;
        if (redactedEventReceived && ackReceived && agentReceived && clientReceived) resolve();
      });

      agentSocket.on('message:ack', (data) => {
        expect(data).toHaveProperty('success', true);
        ackReceived = true;
        if (redactedEventReceived && ackReceived && agentReceived && clientReceived) resolve();
      });

      const checkResolve = () => {
        if (redactedEventReceived && ackReceived && agentReceived && clientReceived) resolve();
      };

      agentSocket.on('message:new', (msg) => {
        if (msg.content === 'Call me at [REDACTED BY SYSTEM]') {
          agentReceived = true;
          checkResolve();
        }
      });

      clientSocket.on('message:new', (msg) => {
        if (msg.content === 'Call me at [REDACTED BY SYSTEM]') {
          clientReceived = true;
          checkResolve();
        }
      });
    });

    await piiSendPromise;

    // Wait a brief moment to ensure events propagate
    await new Promise((res) => setTimeout(res, 200));

    // (4) Verify the persisted message in PostgreSQL also contains the redacted version (never the raw PII)
    const messagesInDb = await prisma.message.findMany({
      where: { channelId: channel1.id },
      orderBy: { createdAt: 'asc' },
    });

    expect(messagesInDb.length).toBe(2);
    expect(messagesInDb[0].content).toBe('Hello client!');
    expect(messagesInDb[1].content).toBe('Call me at [REDACTED BY SYSTEM]');

    // (5) Connect a third socket with a JWT for a different project
    // Verify it does NOT receive messages from the first project's channel
    expect(otherAgentMsgs.length).toBe(0);
  });
});
