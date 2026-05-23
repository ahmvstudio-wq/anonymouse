import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma, redis, redisSubscriber } from '../../utils/db';
import { piiFilter } from '../pii-filter';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey1234567890123456';

export function setupMessaging(io: Server) {
  // Setup Redis subscriber for pattern matching
  redisSubscriber.psubscribe('channel:*', 'admin:monitor', (err: any) => {
    if (err) {
      console.error('Failed to subscribe to Redis patterns:', err);
    } else {
      console.log('Subscribed to Redis channels for pattern matching');
    }
  });

  redisSubscriber.on('pmessage', (pattern: string, channel: string, messageStr: string) => {
    try {
      const parsedMessage = JSON.parse(messageStr);
      if (channel === 'admin:monitor') {
        // Emit to the 'admin' Socket.IO room
        io.to('admin').emit('message:new', parsedMessage);
      } else if (channel.startsWith('channel:')) {
        const projectId = channel.split(':')[1];
        // Emit to the specific project Socket.IO room
        io.to('project:' + projectId).emit('message:new', parsedMessage);
      }
    } catch (error) {
      console.error('Error handling Redis subscriber message:', error);
    }
  });

  // 1. Add an io.use() middleware for JWT authentication
  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error('Authentication error: Token is required'));
      }

      let decoded: any;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err: any) {
        if (err.name === 'TokenExpiredError') {
          return next(new Error('Authentication error: Token expired'));
        }
        return next(new Error('Authentication error: Invalid token'));
      }

      const { userId, systemId, role, jti } = decoded;

      // Check jti against Redis blacklist
      const isBlacklisted = await redis.sismember('jti:blacklist', jti);
      if (isBlacklisted) {
        return next(new Error('Authentication error: Token has been blacklisted'));
      }

      // Attach user details to socket.data
      socket.data = {
        userId,
        systemId,
        role,
        jti,
      };

      next();
    } catch (error) {
      console.error('Socket auth middleware error:', error);
      next(new Error('Authentication error: Internal server error'));
    }
  });

  // 2. On the connection event, set up project room joining
  io.on('connection', (socket: Socket) => {
    console.log(`Socket connected: ${socket.id} (user: ${socket.data.systemId})`);

    // Admin sockets join room 'admin' on connect
    if (socket.data.role === 'ADMIN') {
      socket.join('admin');
    }

    socket.on('channel:join', async (data: { projectId: string }) => {
      try {
        const { projectId } = data;
        if (!projectId) {
          socket.emit('channel:error', 'projectId is required');
          return;
        }

        const userId = socket.data.userId;
        const role = socket.data.role;

        // Query ProjectAssignment to verify the connecting socket's userId is assigned to that project
        if (role !== 'ADMIN') {
          const assignment = await prisma.projectAssignment.findUnique({
            where: {
              projectId_userId: {
                projectId,
                userId,
              },
            },
          });

          if (!assignment) {
            socket.emit('channel:error', 'Not assigned');
            socket.disconnect(true);
            return;
          }
        }

        // Fetch corresponding channel ID to cache on socket.data for fast persists later
        const channel = await prisma.channel.findUnique({
          where: { projectId },
        });

        if (!channel) {
          socket.emit('channel:error', 'Channel not found for this project');
          return;
        }

        // Leave existing project rooms if any
        for (const room of socket.rooms) {
          if (room.startsWith('project:')) {
            socket.leave(room);
          }
        }

        // Join room and save to socket data
        socket.join('project:' + projectId);
        socket.data.projectId = projectId;
        socket.data.channelId = channel.id;

        console.log(`Socket ${socket.id} joined project room: project:${projectId}`);
        socket.emit('channel:joined', { projectId, channelId: channel.id });
      } catch (error) {
        console.error('Socket channel:join error:', error);
        socket.emit('channel:error', 'Internal server error');
      }
    });

    // Handle message:send socket event
    socket.on('message:send', async (data: { content: string }) => {
      try {
        if (!data || typeof data.content !== 'string') {
          socket.emit('message:error', 'Content must be a string');
          return;
        }

        const { projectId, channelId, systemId } = socket.data;

        if (!projectId || !channelId) {
          socket.emit('message:error', 'Not joined to any project channel');
          return;
        }

        // (1) Call piiFilter(data.content) from src/agents/pii-filter
        const filterResult = piiFilter(data.content);
        let finalContent = filterResult.redactedText;

        if (!filterResult.clean) {
          socket.emit('message:redacted', {
            types: filterResult.types,
            notice: 'Your message was edited by the system',
          });
        }

        let messageRecord;
        // (2) INSERT a Message row
        try {
          messageRecord = await prisma.message.create({
            data: {
              channelId,
              senderSystemId: systemId,
              content: finalContent,
            },
          });
        } catch (dbError) {
          console.error('Database message insert failed:', dbError);
          socket.emit('message:error', 'Failed to store message');
          return; // return early — no Redis publish
        }

        // (3) Serialize the message as JSON and publish to Redis
        const serialized = JSON.stringify(messageRecord);
        await redis.publish('channel:' + projectId, serialized);
        await redis.publish('admin:monitor', serialized);

        // (4) Only after step 2 succeeds: emit message:ack to the sender socket
        socket.emit('message:ack', { success: true, messageId: messageRecord.id });
      } catch (error) {
        console.error('Socket message:send error:', error);
        socket.emit('message:error', 'Internal server error');
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id} (user: ${socket.data.systemId})`);
    });
  });
}
