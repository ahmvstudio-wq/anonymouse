import { Response, NextFunction, Router } from 'express';
import { prisma } from '../../utils/db';
import { requireAuth, AuthRequest } from '../auth';

const projectRouter = Router();

// 1. POST /projects
projectRouter.post('/projects', requireAuth(['ADMIN']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, agentIds, clientId } = req.body;

    if (!name || !agentIds || !clientId) {
      res.status(400).json({ error: 'Project name, agentIds, and clientId are required' });
      return;
    }

    if (!Array.isArray(agentIds)) {
      res.status(400).json({ error: 'agentIds must be an array of strings' });
      return;
    }

    // Run everything in a Prisma transaction
    const result = await prisma.$transaction(async (tx) => {
      // (1) Verify each agentId exists as an ACTIVE AGENT user
      for (const agentId of agentIds) {
        const agent = await tx.user.findUnique({
          where: { id: agentId },
        });

        if (!agent || agent.role !== 'AGENT' || agent.status !== 'ACTIVE') {
          throw new Error(`Agent with ID ${agentId} is not an active agent`);
        }
      }

      // (2) Verify clientId exists as an ACTIVE CLIENT user
      const client = await tx.user.findUnique({
        where: { id: clientId },
      });

      if (!client || client.role !== 'CLIENT' || client.status !== 'ACTIVE') {
        throw new Error(`Client with ID ${clientId} is not an active client`);
      }

      // (3) Create the Project record
      const project = await tx.project.create({
        data: {
          name,
          clientId,
        },
      });

      // (4) Create Channel with projectId foreign key
      const channel = await tx.channel.create({
        data: {
          projectId: project.id,
        },
      });

      // (5) Create ProjectAssignment rows for all agentIds and the clientId
      const assignments = [clientId, ...agentIds];
      await tx.projectAssignment.createMany({
        data: assignments.map((userId) => ({
          projectId: project.id,
          userId,
        })),
      });

      return {
        id: project.id,
        name: project.name,
        clientId: project.clientId,
        channelId: channel.id,
      };
    });

    res.json(result);
  } catch (error: any) {
    console.error('Project creation failed:', error);
    // If we threw a specific message about agent/client validation, return a 400
    if (error.message && (error.message.includes('Agent with ID') || error.message.includes('Client with ID'))) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// requireProjectAccess middleware
export async function requireProjectAccess(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const projectId = req.params.projectId || req.body.projectId;

    if (!projectId) {
      res.status(400).json({ error: 'projectId is required for this action' });
      return;
    }

    // ADMIN bypasses checks
    if (req.user.role === 'ADMIN') {
      next();
      return;
    }

    // Query ProjectAssignment for {projectId, userId: req.user.userId}
    const assignment = await prisma.projectAssignment.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: req.user.userId,
        },
      },
    });

    if (!assignment) {
      res.status(403).json({ error: 'Not assigned to this project' });
      return;
    }

    next();
  } catch (error) {
    console.error('requireProjectAccess error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export { projectRouter };
