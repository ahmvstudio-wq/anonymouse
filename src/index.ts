import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { authRouter, adminRouter } from './agents/auth';
import { projectRouter } from './agents/project';
import { adminDashboardRouter } from './agents/admin';
import { fileRouter } from './agents/file';

import { setupMessaging } from './agents/messaging';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

// Setup messaging socket handlers
setupMessaging(io);

app.use(cors());
app.use(express.json());
app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/admin', adminDashboardRouter);
app.use('/', projectRouter);
app.use('/', fileRouter);

app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

export { app, server, io };
