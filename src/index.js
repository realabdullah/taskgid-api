/* eslint-disable require-jsdoc */
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import YAML from 'yamljs';
import path from 'path';
import {fileURLToPath} from 'url';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import 'dotenv/config';
import expressSanitizer from 'express-sanitizer';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import auth from './routes/authRoutes.js';
import user from './routes/userRoutes.js';
import workspace from './routes/workspaceRoutes.js';
import task from './routes/taskRoutes.js';
import invite from './routes/inviteRoutes.js';
import attachmentRoutes from './routes/attachmentRoutes.js';
import statisticsRoutes from './routes/statisticsRoutes.js';
import pusherRoutes from './routes/pusherRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';

import setupAssociations from './models/associations.js';
import {syncDatabase} from './config/database.js';

const app = express();
const port = process.env.PORT || 3000;

// Trust proxy for Vercel/proxied environments
app.set('trust proxy', 1);

// Body parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

// CORS middleware
const allowedOrigins = [process.env.FRONTEND_URL || 'http://localhost:5173', 'http://localhost:3000'];
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));

// Helmet middleware for secure HTTP headers
app.use(helmet());

// Global Rate limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests from this IP, please try again after 15 minutes' },
});
app.use(globalLimiter);

// Sanitizer middleware
app.use(expressSanitizer());

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const swaggerDocument = JSON.parse(fs.readFileSync(path.join(__dirname, '../swagger-output.json'), 'utf8'));

// Set up model associations
setupAssociations();

// Sync database
syncDatabase(false).catch((error) => {
    console.error('Failed to sync database:', error);
    process.exit(1);
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/auth', auth);
app.use('/users', user);
app.use('/workspaces', workspace);
app.use('/workspaces/:workspaceSlug/tasks', task);
app.use('/workspaces/:workspaceSlug/statistics', statisticsRoutes);
app.use('/invite', invite);
app.use('/attachments', attachmentRoutes);
app.use('/api/pusher', pusherRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/media', mediaRoutes);

// Global Error Handling Middleware
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    const status = err.status || 500;
    
    // In production, mask internal server errors
    let message = err.message || 'Internal Server Error';
    if (status === 500 && process.env.NODE_ENV === 'production') {
        message = 'An unexpected error occurred. Please try again later.';
    }
    
    res.status(status).json({ success: false, error: message });
});

if (import.meta.url === `file://${process.argv[1]}`) {
    app.listen(port, () => console.log(`Server is running on port ${port}`));
}

export default app;
