import express from 'express';
import User from '../models/User.js';
import McpOAuthClient from '../models/McpOAuthClient.js';
import {
    issueAuthorizationCode,
    listConsentWorkspaces,
    signPendingAuth,
    verifyPendingAuth,
} from '../services/mcpOAuthProvider.js';
import {
    renderErrorPage,
    renderLoginPage,
    renderWorkspacePage,
} from '../services/mcpOAuthConsent.js';

// eslint-disable-next-line new-cap
const router = express.Router();

const PENDING_COOKIE = 'mcp_oauth_pending';

/**
 * Reads a cookie value from the Cookie header.
 * @param {Object} req - Express request.
 * @param {string} name - Cookie name.
 * @return {string|undefined} Cookie value.
 */
const readCookie = (req, name) => {
    const header = req.headers.cookie;
    if (!header) return undefined;
    for (const part of header.split(';')) {
        const [k, ...rest] = part.trim().split('=');
        if (k === name) return decodeURIComponent(rest.join('='));
    }
    return undefined;
};

/**
 * @param {string} clientId - Registered client id.
 * @return {Promise<string|null>} Display name.
 */
const clientLabel = async (clientId) => {
    const row = await McpOAuthClient.findByClientId(clientId);
    if (!row) return null;
    return row.metadata?.client_name || row.clientId;
};

/**
 * GET /mcp/oauth/consent — login form, or error when no pending auth.
 * @param {Object} req - Express request.
 * @param {Object} res - Express response.
 * @return {Promise<void>}
 */
/**
 * Consent pages ship a small inline stylesheet; loosen CSP for this route only.
 * @param {Object} res - Express response.
 * @return {void}
 */
const allowInlineStyles = (res) => {
    res.set(
        'Content-Security-Policy',
        'default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'self\'',
    );
};

const showConsent = async (req, res) => {
    allowInlineStyles(res);
    const pending = verifyPendingAuth(readCookie(req, PENDING_COOKIE));
    if (!pending) {
        res.status(400).type('html').send(renderErrorPage(
            'No pending authorization. Start the connection again from your MCP client.',
        ));
        return;
    }
    const name = await clientLabel(pending.clientId);
    res.type('html').send(renderLoginPage({clientName: name}));
};

/**
 * POST /mcp/oauth/consent — login step or approve step.
 * @param {Object} req - Express request.
 * @param {Object} res - Express response.
 * @return {Promise<void>}
 */
const handleConsent = async (req, res) => {
    allowInlineStyles(res);
    const pending = verifyPendingAuth(readCookie(req, PENDING_COOKIE));
    if (!pending) {
        res.status(400).type('html').send(renderErrorPage(
            'Authorization session expired. Start again from your MCP client.',
        ));
        return;
    }

    const step = req.body?.step;
    const clientName = await clientLabel(pending.clientId);

    if (step === 'login') {
        const email = String(req.body?.email || '').toLowerCase().trim();
        const password = String(req.body?.password || '');
        const user = await User.findByCredentials(email, password);
        if (!user) {
            res.status(401).type('html').send(renderLoginPage({
                error: 'Invalid email or password.',
                clientName,
            }));
            return;
        }

        const workspaces = await listConsentWorkspaces(user.id);
        const session = signPendingAuth({
            kind: 'consent_session',
            userId: user.id,
        });

        res.type('html').send(renderWorkspacePage({
            workspaces,
            session,
            clientName,
            userLabel: user.email,
        }));
        return;
    }

    if (step === 'approve') {
        const session = verifyPendingAuth(req.body?.session);
        if (!session?.userId || session.kind !== 'consent_session') {
            res.status(400).type('html').send(renderLoginPage({
                error: 'Session expired. Sign in again.',
                clientName,
            }));
            return;
        }

        const user = await User.findByPk(session.userId);
        if (!user) {
            res.status(401).type('html').send(renderLoginPage({
                error: 'Account not found. Sign in again.',
                clientName,
            }));
            return;
        }

        try {
            const {redirectUrl} = await issueAuthorizationCode({
                pending,
                user,
                workspaceId: req.body?.workspaceId,
            });
            res.clearCookie(PENDING_COOKIE, {path: '/'});
            res.redirect(302, redirectUrl);
        } catch (err) {
            const workspaces = await listConsentWorkspaces(user.id);
            res.status(err.status || 400).type('html').send(renderWorkspacePage({
                workspaces,
                session: req.body?.session,
                clientName,
                userLabel: user.email,
                error: err.message || 'Unable to complete authorization.',
            }));
        }
        return;
    }

    res.status(400).type('html').send(renderLoginPage({
        error: 'Unknown step.',
        clientName,
    }));
};

router.get('/', showConsent);
router.post('/', express.urlencoded({extended: false}), handleConsent);

export default router;
