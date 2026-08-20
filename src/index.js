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
import calendarRoutes from './routes/calendarRoutes.js';
import attachmentRoutes from './routes/attachmentRoutes.js';
import recurrenceRoutes from './routes/recurrenceRoutes.js';
import pusherRoutes from './routes/pusherRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';
import slackRoutes from './routes/slackRoutes.js';
import mcpRoutes from './routes/mcpRoutes.js';
import {mcpAuthRouter} from '@modelcontextprotocol/sdk/server/auth/router.js';
import {
    apiOrigin,
    createMcpOAuthProvider,
    MCP_SCOPES,
    mcpResourceUrl,
} from './services/mcpOAuthProvider.js';

import setupAssociations from './models/associations.js';
import {syncDatabase} from './config/database.js';

const app = express();
const port = process.env.PORT || 3000;

// Trust proxy for Vercel/proxied environments
app.set('trust proxy', 1);

// MCP OAuth (RFC 8414 / 7591 / PKCE). Mounted at the app root so discovery
// lands at /.well-known/oauth-authorization-server as clients expect.
// HTTP issuer URLs are allowed only outside production (local dev).
if (process.env.NODE_ENV !== 'production') {
    process.env.MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL ??= 'true';
}
const mcpOAuthProvider = createMcpOAuthProvider();
const issuer = new URL(apiOrigin());
app.use(mcpAuthRouter({
    provider: mcpOAuthProvider,
    issuerUrl: issuer,
    baseUrl: issuer,
    resourceServerUrl: mcpResourceUrl(),
    scopesSupported: MCP_SCOPES,
    resourceName: 'Taskgid MCP',
}));

// Capture the exact body bytes Slack signed, before any parser mutates them.
const captureRawBody = (req, _res, buf) => {
    if (buf?.length) req.rawBody = buf.toString('utf8');
};

// Body parser middleware
app.use(bodyParser.json({verify: captureRawBody}));
app.use(bodyParser.urlencoded({extended: true, verify: captureRawBody}));

// CORS: SPA origin(s), this API's configured public origin, and the request's
// own host. The last matters for MCP consent — the form is served from whatever
// host the browser hit (custom domain, Vercel URL, …), which may not equal
// PUBLIC_API_URL. Reject with callback(null, false), never throw: throwing
// becomes an unhandled 500 instead of a quiet CORS failure.
const allowedOrigins = new Set([
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://localhost:3000',
    apiOrigin(),
].filter(Boolean));
app.use((req, res, next) => {
    const requestOrigin = `${req.protocol}://${req.get('host')}`;
    cors({
        origin: (origin, callback) => {
            if (!origin ||
                allowedOrigins.has(origin) ||
                origin === requestOrigin) {
                callback(null, true);
                return;
            }
            callback(null, false);
        },
        credentials: true,
    })(req, res, next);
});

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
syncDatabase({ force: false }).catch((error) => {
    console.error('Failed to sync database:', error);
    process.exit(1);
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/auth', auth);
app.use('/users', user);
app.use('/workspaces', workspace);
app.use('/workspaces/:workspaceSlug/tasks', task);
app.use('/workspaces/:workspaceSlug/recurrences', recurrenceRoutes);
app.use('/invite', invite);
app.use('/calendar', calendarRoutes);
app.use('/attachments', attachmentRoutes);
app.use('/api/pusher', pusherRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/media', mediaRoutes);
app.use('/slack', slackRoutes);
app.use('/mcp', mcpRoutes);

// Global Error Handling Middleware
app.use((err, req, res, next) => {
    // Log the full error with request context for debugging
    const sanitizedBody = { ...req.body };
    const sensitiveFields = ['password', 'newPassword', 'oldPassword', 'token', 'refreshToken'];
    sensitiveFields.forEach(field => {
        if (sanitizedBody[field]) sanitizedBody[field] = '********';
    });

    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} - Unhandled Error:`, {
        message: err.message,
        stack: err.stack,
        body: sanitizedBody,
    });

    const status = err.status || 500;
    
    // In production, mask internal server errors for security
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
