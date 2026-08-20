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
    renderRedirectPage,
    renderWorkspacePage,
} from '../services/mcpOAuthConsent.js';

// eslint-disable-next-line new-cap
const router = express.Router();

/**
 * Reads the signed pending-grant token from the form body or query string.
 * Cookies are not used: authorize and consent may hit different hosts.
 * @param {Object} req - Express request.
 * @return {string|undefined} Raw pending token.
 */
const readPendingToken = (req) => {
    const fromBody = req.body?.pending;
    if (typeof fromBody === 'string' && fromBody) return fromBody;
    const fromQuery = req.query?.pending;
    if (typeof fromQuery === 'string' && fromQuery) return fromQuery;
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
 * Consent pages ship a small inline stylesheet; loosen CSP for this route only.
 * @param {Object} res - Express response.
 * @return {void}
 */
const allowInlineStyles = (res) => {
    // form-action must allow the MCP client's redirect_uri (e.g. claude.ai).
    // Restricting it to 'self' makes Allow access appear to hang: the 302 is
    // issued but the browser refuses to navigate off this origin.
    res.set(
        'Content-Security-Policy',
        'default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; ' +
            'form-action \'self\' https: http://localhost:* http://127.0.0.1:*',
    );
};

/**
 * GET /mcp/oauth/consent — login form, or error when no pending auth.
 * @param {Object} req - Express request.
 * @param {Object} res - Express response.
 * @return {Promise<void>}
 */
const showConsent = async (req, res) => {
    allowInlineStyles(res);
    const pendingToken = readPendingToken(req);
    const pending = verifyPendingAuth(pendingToken);
    if (!pending || !pendingToken) {
        res.status(400).type('html').send(renderErrorPage(
            'No pending authorization. Start the connection again from your MCP client.',
        ));
        return;
    }
    const name = await clientLabel(pending.clientId);
    res.type('html').send(renderLoginPage({clientName: name, pending: pendingToken}));
};

/**
 * POST /mcp/oauth/consent — login step or approve step.
 * @param {Object} req - Express request.
 * @param {Object} res - Express response.
 * @return {Promise<void>}
 */
const handleConsent = async (req, res) => {
    allowInlineStyles(res);
    const pendingToken = readPendingToken(req);
    const pending = verifyPendingAuth(pendingToken);
    if (!pending || !pendingToken) {
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
                pending: pendingToken,
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
            pending: pendingToken,
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
                pending: pendingToken,
            }));
            return;
        }

        const user = await User.findByPk(session.userId);
        if (!user) {
            res.status(401).type('html').send(renderLoginPage({
                error: 'Account not found. Sign in again.',
                clientName,
                pending: pendingToken,
            }));
            return;
        }

        try {
            const {redirectUrl} = await issueAuthorizationCode({
                pending,
                user,
                workspaceId: req.body?.workspaceId,
            });
            // Prefer an HTML handoff over a bare 302: CSP form-action and some
            // browsers treat cross-origin form redirects poorly, which looked
            // like a hang after Allow access.
            res.status(200).type('html').send(renderRedirectPage(redirectUrl));
        } catch (err) {
            console.error('MCP consent approve failed:', err);
            const workspaces = await listConsentWorkspaces(user.id);
            res.status(err.status || 400).type('html').send(renderWorkspacePage({
                workspaces,
                session: req.body?.session,
                pending: pendingToken,
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
        pending: pendingToken,
    }));
};

router.get('/', showConsent);
router.post('/', express.urlencoded({extended: false}), handleConsent);

export default router;
