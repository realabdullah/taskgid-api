/* eslint-disable require-jsdoc */
import path from 'path';
import {fileURLToPath} from 'url';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import 'dotenv/config';
import expressSanitizer from 'express-sanitizer';

import auth from './routes/authRoutes.js';
import user from './routes/userRoutes.js';
import workspace from './routes/workspaceRoutes.js';
import task from './routes/taskRoutes.js';
import team from './routes/teamRoutes.js';
import invite from './routes/inviteRoutes.js';
import attachmentRoutes from './routes/attachmentRoutes.js';
import statisticsRoutes from './routes/statisticsRoutes.js';

import setupAssociations from './models/associations.js';
import {syncDatabase} from './config/database.js';

const app = express();
const port = process.env.PORT || 3000;

// Body parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

// CORS middleware
app.use(cors());

// Sanitizer middleware
app.use(expressSanitizer());

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Set up model associations
setupAssociations();

// Sync database
syncDatabase(false).catch((error) => {
    console.error('Failed to sync database:', error);
    process.exit(1);
});

app.use('/auth', auth);
app.use('/users', user);
app.use('/workspaces', workspace);
app.use('/workspaces/:workspaceSlug/tasks', task);
app.use('/workspaces/:workspaceSlug/statistics', statisticsRoutes);
app.use('/teams', team);
app.use('/invite', invite);
app.use('/attachments', attachmentRoutes);

app.listen(port, () => console.log(`Server is running on port ${port}`));
