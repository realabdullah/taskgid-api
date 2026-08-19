import express from 'express';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import authMiddleware from '../middleware/authMiddleware.js';
import {createMcpServer} from '../services/mcpService.js';
import {errorResponse} from '../utils/responseUtils.js';

// eslint-disable-next-line new-cap
const router = express.Router();

/**
 * MCP is workspace-scoped via API keys. A session JWT has no single workspace,
 * so it cannot choose which tools to expose; reject it here rather than guess.
 * @param {Object} req - Express request.
 * @param {Object} res - Express response.
 * @param {Function} next - Next middleware.
 * @return {void}
 */
const requireApiKey = (req, res, next) => {
    if (!req.apiKey) {
        return errorResponse(
            res,
            401,
            'MCP requires a workspace API key (Authorization: Bearer tg_key_…)',
        );
    }
    next();
};

/**
 * Handles one MCP Streamable HTTP POST. Stateless: a fresh server and transport
 * per request, so nothing is held across serverless invocations.
 * @param {Object} req - Express request.
 * @param {Object} res - Express response.
 * @return {Promise<void>}
 */
const handleMcpPost = async (req, res) => {
    const server = createMcpServer({user: req.user, apiKey: req.apiKey});
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

router.use(authMiddleware, requireApiKey);
router.post('/', handleMcpPost);
router.get('/', methodNotAllowed);
router.delete('/', methodNotAllowed);

export default router;
