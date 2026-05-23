import { Response, Router } from 'express';
import { prisma } from '../../utils/db';
import { requireAuth, AuthRequest } from '../auth';

const adminDashboardRouter = Router();

// (1) GET /admin/messages
adminDashboardRouter.get('/messages', requireAuth(['ADMIN']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const agentSystemId = req.query.agentSystemId as string | undefined;
    const clientSystemId = req.query.clientSystemId as string | undefined;
    const cursor = req.query.cursor as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    const whereClause: any = {};

    if (projectId) {
      whereClause.channel = { projectId };
    }

    if (agentSystemId) {
      whereClause.senderSystemId = agentSystemId;
    }

    if (clientSystemId) {
      whereClause.senderSystemId = clientSystemId;
    }

    // Query messages table joined to Channel
    const messages = await prisma.message.findMany({
      where: whereClause,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        channel: true,
      },
    });

    let nextCursor: string | null = null;
    if (messages.length > limit) {
      const nextItem = messages.pop();
      nextCursor = nextItem!.id;
    }

    const formattedMessages = messages.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      senderSystemId: m.senderSystemId,
      content: m.content,
      createdAt: m.createdAt,
    }));

    res.json({
      messages: formattedMessages,
      nextCursor,
    });
  } catch (error) {
    console.error('Error fetching admin messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// (2) GET /admin/projects
adminDashboardRouter.get('/projects', requireAuth(['ADMIN']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const projects = await prisma.project.findMany({
      include: {
        channel: {
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { createdAt: true },
            },
            _count: {
              select: { messages: true },
            },
          },
        },
        client: {
          select: { systemId: true },
        },
        assignments: {
          include: {
            user: {
              select: { systemId: true, role: true },
            },
          },
        },
      },
    });

    const formattedProjects = projects.map((p) => {
      const agents = p.assignments
        .filter((a) => a.user.role === 'AGENT')
        .map((a) => a.user.systemId);

      const lastMessage = p.channel?.messages[0];

      return {
        id: p.id,
        name: p.name,
        channel: p.channel ? { id: p.channel.id, projectId: p.channel.projectId } : null,
        agents,
        clientSystemId: p.client.systemId,
        messageCount: p.channel?._count.messages || 0,
        lastMessageCreatedAt: lastMessage ? lastMessage.createdAt : null,
      };
    });

    res.json(formattedProjects);
  } catch (error) {
    console.error('Error fetching admin projects:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// (3) GET /admin/users
adminDashboardRouter.get('/users', requireAuth(['ADMIN']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      select: {
        systemId: true,
        role: true,
        status: true,
      },
    });

    res.json(users);
  } catch (error) {
    console.error('Error fetching admin users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { adminDashboardRouter };
