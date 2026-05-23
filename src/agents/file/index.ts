import { Response, Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import PizZip from 'pizzip';
import crypto from 'crypto';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { prisma } from '../../utils/db';
import { requireAuth, AuthRequest } from '../auth';
import { requireProjectAccess } from '../project';

const fileRouter = Router();

// Multer memory storage with 25MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB
  },
});

// Initialize S3 client using environment variables
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'mock',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'mock',
  },
});

// POST /files/upload
fileRouter.post(
  '/files/upload',
  requireAuth(['ADMIN', 'AGENT', 'CLIENT']),
  upload.single('file'),
  requireProjectAccess,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const projectId = req.body.projectId || req.params.projectId;
      const buffer = req.file.buffer;
      const mimetype = req.file.mimetype;
      let cleanBuffer = buffer;

      // (2) Strip EXIF if image
      if (['image/jpeg', 'image/png', 'image/webp'].includes(mimetype)) {
        try {
          cleanBuffer = await sharp(buffer).toBuffer();
        } catch (sharpError) {
          console.error('Sharp processing error:', sharpError);
          res.status(400).json({ error: 'Failed to process image file' });
          return;
        }
      }

      // (3) Clear Word/Excel metadata if docx/xlsx
      const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      if (mimetype === docxMime || mimetype === xlsxMime) {
        try {
          const zip = new PizZip(buffer);
          // Set docProps/core.xml to empty string to strip author/metadata
          zip.file('docProps/core.xml', '');
          cleanBuffer = zip.generate({ type: 'nodebuffer' });
        } catch (zipError) {
          console.error('PizZip processing error:', zipError);
          res.status(400).json({ error: 'Failed to process document file' });
          return;
        }
      }

      // (4) Upload to S3
      const ext = path.extname(req.file.originalname);
      const key = `${projectId}/${Date.now()}-${crypto.randomUUID()}${ext}`;

      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME || 'mock-bucket',
            Key: key,
            Body: cleanBuffer,
            ContentType: mimetype,
          })
        );
      } catch (s3Error) {
        console.error('S3 Upload Error:', s3Error);
        // (5) If S3 upload throws, return 502 immediately with no DB writes.
        res.status(502).json({ error: 'Bad Gateway: File upload to storage failed' });
        return;
      }

      // (6) INSERT FileRecord and FileAccessLog in a Prisma transaction
      const result = await prisma.$transaction(async (tx) => {
        const fileRecord = await tx.fileRecord.create({
          data: {
            projectId,
            uploaderSystemId: req.user!.systemId,
            s3Key: key,
            originalName: req.file!.originalname,
            mimeType: mimetype,
          },
        });

        await tx.fileAccessLog.create({
          data: {
            fileId: fileRecord.id,
            actorSystemId: req.user!.systemId,
            action: 'UPLOAD',
          },
        });

        return fileRecord;
      });

      // (7) Generate presigned URL
      const getCommand = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME || 'mock-bucket',
        Key: key,
      });
      const presignedUrl = await getSignedUrl(s3, getCommand, { expiresIn: 86400 });

      res.json({
        fileId: result.id,
        url: presignedUrl,
        s3Key: key,
        originalName: result.originalName,
      });
    } catch (error) {
      console.error('Upload handler error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /files/:fileId
fileRouter.get(
  '/files/:fileId',
  requireAuth(['ADMIN', 'AGENT', 'CLIENT']),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { fileId } = req.params;

      if (!fileId) {
        res.status(400).json({ error: 'fileId parameter is required' });
        return;
      }

      // (1) Find FileRecord by fileId
      const fileRecord = await prisma.fileRecord.findUnique({
        where: { id: fileId },
      });

      if (!fileRecord) {
        res.status(404).json({ error: 'File record not found' });
        return;
      }

      // (2) Check requester is assigned or ADMIN
      if (req.user!.role !== 'ADMIN') {
        const assignment = await prisma.projectAssignment.findUnique({
          where: {
            projectId_userId: {
              projectId: fileRecord.projectId,
              userId: req.user!.userId,
            },
          },
        });

        if (!assignment) {
          res.status(403).json({ error: 'Access denied: Not assigned to this project' });
          return;
        }
      }

      // (3) Generate presigned URL
      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME || 'mock-bucket',
        Key: fileRecord.s3Key,
      });
      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 86400 });

      // (4) INSERT FileAccessLog (log but don't block return on failure)
      try {
        await prisma.fileAccessLog.create({
          data: {
            fileId: fileRecord.id,
            actorSystemId: req.user!.systemId,
            action: 'DOWNLOAD',
          },
        });
      } catch (logError) {
        console.error('Failed to log file download access:', logError);
      }

      res.json({
        url: signedUrl,
        expiresIn: 86400,
      });
    } catch (error) {
      console.error('Download handler error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export { fileRouter };
