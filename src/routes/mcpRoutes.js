import express from 'express';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {getOAuthProtectedResourceMetadataUrl} from '@modelcontextprotocol/sdk/server/auth/router.js';
import ApiKey, {API_KEY_PREFIX} from '../models/ApiKey.js';
import User from '../models/User.js';
import {createMcpServer} from '../services/mcpService.js';
import {
    mcpResourceUrl,
    resolveMcpOAuthBearer,
} from '../services/mcpOAuthProvider.js';
import mcpOAuthConsentRoutes from './mcpOAuthConsentRoutes.js';

// eslint-disable-next-line new-cap
const router = express.Router();

/**
 * Builds the WWW-Authenticate challenge that steers OAuth clients (Claude.ai)
 * at our protected-resource metadata.
 * @return {string} Header value.
 */
const wwwAuthenticate = () => {
    const resourceMetadata = getOAuthProtectedResourceMetadataUrl(mcpResourceUrl());
    return `Bearer realm="taskgid", resource_metadata="${resourceMetadata}"`;
};

/**
 * Resolves Bearer credentials for /mcp: workspace API keys (tg_key_…) or
 * short-lived MCP OAuth access tokens (mcp_at_…). Session JWTs are rejected
 * because they are not pinned to a single workspace.
 * @param {Object} req - Express request.
 * @param {Object} res - Express response.
 * @param {Function} next - Next middleware.
 * @return {Promise<void>}
 */
const authenticateMcp = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.set('WWW-Authenticate', wwwAuthenticate());
        return res.status(401).json({
            jsonrpc: '2.0',
            error: {code: -32001, message: 'Unauthorized'},
            id: null,
        });
    }

    const token = authHeader.slice('Bearer '.length).trim();

    try {
        if (token.startsWith(API_KEY_PREFIX)) {
            const apiKey = await ApiKey.findActiveByRawKey(token);
            if (!apiKey) {
                res.set('WWW-Authenticate', wwwAuthenticate());
                return res.status(401).json({
                    jsonrpc: '2.0',
                    error: {code: -32001, message: 'Invalid API key'},
                    id: null,
                });
            }
            const user = await User.findByPk(apiKey.userId);
            if (!user) {
                res.set('WWW-Authenticate', wwwAuthenticate());
                return res.status(401).json({
                    jsonrpc: '2.0',
                    error: {code: -32001, message: 'Invalid API key'},
                    id: null,
                });
            }
            req.user = user;
            req.apiKey = apiKey;
            req.apiKeyWorkspaceId = apiKey.workspaceId;
            apiKey.update({lastUsedAt: new Date()}).catch((err) => {
                console.error('Failed to record API key use:', err.message);
            });
            return next();
        }

        if (token.startsWith('mcp_at_')) {
            const resolved = await resolveMcpOAuthBearer(token);
            if (!resolved) {
                res.set('WWW-Authenticate', wwwAuthenticate());
                return res.status(401).json({
                    jsonrpc: '2.0',
                    error: {code: -32001, message: 'Invalid or expired OAuth token'},
                    id: null,
                });
            }
            req.user = resolved.user;
            req.apiKey = null;
            req.apiKeyWorkspaceId = resolved.workspace.id;
            req.mcpOAuthWorkspace = resolved.workspace;
            req.mcpOAuthToken = resolved.oauthToken;
            return next();
        }

        res.set('WWW-Authenticate', wwwAuthenticate());
        return res.status(401).json({
            jsonrpc: '2.0',
            error: {
                code: -32001,
                message: 'MCP requires a workspace API key or an OAuth access token',
            },
            id: null,
        });
    } catch (err) {
        console.error('MCP auth failed:', err);
        return res.status(500).json({
            jsonrpc: '2.0',
            error: {code: -32603, message: 'Internal server error'},
            id: null,
        });
    }
};

/**
 * Handles one MCP Streamable HTTP POST. Stateless: a fresh server and transport
 * per request, so nothing is held across serverless invocations.
 * @param {Object} req - Express request.
 * @param {Object} res - Express response.
 * @return {Promise<void>}
 */
const handleMcpPost = async (req, res) => {
    const server = createMcpServer({
        user: req.user,
        apiKey: req.apiKey,
        workspace: req.mcpOAuthWorkspace || null,
    });
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
    });

    const cleanup = () => {
        transport.close().catch(() => {});
        server.close().catch(() => {});
    };
    res.on('close', cleanup);

    try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (err) {
        console.error('MCP request failed:', err);
        cleanup();
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {code: -32603, message: 'Internal server error'},
                id: null,
            });
        }
    }
};

/**
 * Stateless mode has no sessions to resume or tear down.
 * @param {Object} _req - Express request.
 * @param {Object} res - Express response.
 * @return {void}
 */
const methodNotAllowed = (_req, res) => {
    res.status(405).json({
        jsonrpc: '2.0',
        error: {code: -32000, message: 'Method not allowed.'},
        id: null,
    });
};

// Consent UI is unauthenticated; the pending cookie is the only session.
router.use('/oauth/consent', mcpOAuthConsentRoutes);

router.post('/', authenticateMcp, handleMcpPost);
router.get('/', authenticateMcp, methodNotAllowed);
router.delete('/', authenticateMcp, methodNotAllowed);

export default router;
