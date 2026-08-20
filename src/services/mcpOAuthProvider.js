import crypto from 'crypto';
import {Op} from 'sequelize';
import McpOAuthClient from '../models/McpOAuthClient.js';
import McpOAuthCode from '../models/McpOAuthCode.js';
import McpOAuthToken from '../models/McpOAuthToken.js';
import User from '../models/User.js';
import {Workspace} from '../models/Workspace.js';
import WorkspaceTeam from '../models/WorkspaceTeam.js';
import {
    InvalidGrantError,
    InvalidTokenError,
    ServerError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';

/** Scopes this authorization server issues. */
export const MCP_SCOPES = ['mcp:tools'];

const CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TTL_SEC = 60 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PENDING_TTL_MS = 15 * 60 * 1000;

/**
 * Public origin of this API (no trailing slash).
 * @return {string} Absolute origin.
 */
export const apiOrigin = () => {
    const base = process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 8000}`;
    return base.replace(/\/$/, '');
};

/**
 * MCP resource identifier advertised to clients.
 * @return {URL} Absolute /mcp URL.
 */
export const mcpResourceUrl = () => new URL('/mcp', `${apiOrigin()}/`);

/**
 * @param {string} raw - Value to hash.
 * @return {string} Hex SHA-256.
 */
const sha256 = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

/**
 * @return {string} Opaque random credential.
 */
const randomToken = () => crypto.randomBytes(32).toString('base64url');

/**
 * Short-lived signed cookie binding a pending authorization request while the
 * user signs in and picks a workspace. Stored as a JWT-less HMAC blob so we
 * do not need a new secret beyond JWT_SECRET.
 * @param {Object} payload - Pending request fields.
 * @return {string} Signed payload.
 */
export const signPendingAuth = (payload) => {
    const body = Buffer.from(JSON.stringify({
        ...payload,
        exp: Date.now() + PENDING_TTL_MS,
    })).toString('base64url');
    const secret = process.env.JWT_SECRET || 'dev';
    const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${sig}`;
};

/**
 * @param {string} value - Signed pending-auth cookie.
 * @return {Object|null} Payload, or null when missing/invalid/expired.
 */
export const verifyPendingAuth = (value) => {
    if (!value || typeof value !== 'string') return null;
    const [body, sig] = value.split('.');
    if (!body || !sig) return null;
    const secret = process.env.JWT_SECRET || 'dev';
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (!payload?.exp || payload.exp < Date.now()) return null;
        return payload;
    } catch {
        return null;
    }
};

/**
 * Persistent OAuth client registry used by the MCP SDK auth router.
 */
class DbClientsStore {
    /**
     * @param {string} clientId - Public client id.
     * @return {Promise<Object|undefined>} Client information document.
     */
    async getClient(clientId) {
        const row = await McpOAuthClient.findByClientId(clientId);
        return row ? row.toClientInformation() : undefined;
    }

    /**
     * @param {Object} client - Client metadata with generated credentials.
     * @return {Promise<Object>} Stored client information (includes secret once).
     */
    async registerClient(client) {
        const clientId = client.client_id;
        const issuedAt = client.client_id_issued_at ?? Math.floor(Date.now() / 1000);
        const secretExpiresAt = client.client_secret_expires_at ?? 0;
        const rawSecret = client.client_secret;
        const metadata = {...client};
        delete metadata.client_id;
        delete metadata.client_secret;
        delete metadata.client_id_issued_at;
        delete metadata.client_secret_expires_at;

        await McpOAuthClient.create({
            clientId,
            // Column name is historical; value is AES-GCM sealed, not a hash.
            clientSecretHash: rawSecret ? McpOAuthClient.sealSecret(rawSecret) : null,
            clientIdIssuedAt: issuedAt,
            clientSecretExpiresAt: secretExpiresAt || null,
            metadata,
        });

        return {
            ...metadata,
            client_id: clientId,
            client_secret: rawSecret,
            client_id_issued_at: issuedAt,
            client_secret_expires_at: secretExpiresAt,
        };
    }
}

/**
 * Issues and verifies MCP OAuth credentials. Authorization is interactive:
 * `authorize` parks the request and redirects the browser to the consent page.
 */
export class TaskgidMcpOAuthProvider {
    /**
     * Constructs the provider.
     */
    constructor() {
        this.clientsStore = new DbClientsStore();
    }

    /**
     * Parks the authorization request and sends the user to the consent UI.
     * @param {Object} client - Registered client.
     * @param {Object} params - Authorization parameters from the client.
     * @param {Object} res - Express response.
     * @return {Promise<void>}
     */
    async authorize(client, params, res) {
        // redirect_uri already validated by the SDK handler (incl. loopback ports).
        const pending = signPendingAuth({
            clientId: client.client_id,
            redirectUri: params.redirectUri,
            codeChallenge: params.codeChallenge,
            state: params.state ?? null,
            scopes: params.scopes?.length ? params.scopes : MCP_SCOPES,
            resource: params.resource ? params.resource.toString() : null,
        });

        // Carry the pending grant in the query string, not only a cookie.
        // Authorize and consent may land on different hosts (deployment URL vs
        // PUBLIC_API_URL), and a cookie set on one is invisible to the other.
        const consent = new URL('/mcp/oauth/consent', `${apiOrigin()}/`);
        consent.searchParams.set('pending', pending);
        res.redirect(302, consent.toString());
    }

    /**
     * @param {Object} client - Registered client.
     * @param {string} authorizationCode - Raw code.
     * @return {Promise<string>} Stored code_challenge.
     */
    async challengeForAuthorizationCode(client, authorizationCode) {
        const row = await McpOAuthCode.findActiveByRaw(authorizationCode);
        if (!row || row.clientId !== client.client_id) {
            throw new InvalidGrantError('Invalid authorization code');
        }
        return row.codeChallenge;
    }

    /**
     * @param {Object} client - Registered client.
     * @param {string} authorizationCode - Raw code.
     * @param {string} [_codeVerifier] - Unused; PKCE checked by the SDK.
     * @param {string} [redirectUri] - Must match the authorized redirect.
     * @param {URL} [_resource] - Optional resource indicator.
     * @return {Promise<Object>} Token response.
     */
    async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri) {
        const row = await McpOAuthCode.findActiveByRaw(authorizationCode);
        if (!row || row.clientId !== client.client_id) {
            throw new InvalidGrantError('Invalid authorization code');
        }
        if (redirectUri && redirectUri !== row.redirectUri) {
            throw new InvalidGrantError('redirect_uri does not match');
        }

        await row.destroy();
        return this.#issueTokens({
            clientId: row.clientId,
            userId: row.userId,
            workspaceId: row.workspaceId,
            scopes: row.scopes,
            resource: row.resource,
        });
    }

    /**
     * @param {Object} client - Registered client.
     * @param {string} refreshToken - Raw refresh token.
     * @param {string[]} [scopes] - Optional down-scoped list.
     * @return {Promise<Object>} Token response.
     */
    async exchangeRefreshToken(client, refreshToken, scopes) {
        const row = await McpOAuthToken.findActiveRefreshToken(refreshToken);
        if (!row || row.clientId !== client.client_id) {
            throw new InvalidGrantError('Invalid refresh token');
        }

        const nextScopes = scopes?.length ?
            scopes.filter((s) => row.scopes.includes(s)) :
            row.scopes;
        if (scopes?.length && nextScopes.length !== scopes.length) {
            throw new InvalidGrantError('Requested scope exceeds original grant');
        }

        await row.update({revokedAt: new Date()});
        return this.#issueTokens({
            clientId: row.clientId,
            userId: row.userId,
            workspaceId: row.workspaceId,
            scopes: nextScopes,
            resource: row.resource,
        });
    }

    /**
     * @param {string} token - Raw access token.
     * @return {Promise<Object>} AuthInfo for the MCP SDK.
     */
    async verifyAccessToken(token) {
        const row = await McpOAuthToken.findActiveAccessToken(token);
        if (!row) throw new InvalidTokenError('Invalid or expired token');

        return {
            token,
            clientId: row.clientId,
            scopes: row.scopes,
            expiresAt: Math.floor(row.accessExpiresAt.getTime() / 1000),
            resource: row.resource ? new URL(row.resource) : undefined,
            extra: {
                userId: row.userId,
                workspaceId: row.workspaceId,
            },
        };
    }

    /**
     * @param {Object} client - Registered client.
     * @param {Object} request - Revocation request body.
     * @return {Promise<void>}
     */
    async revokeToken(client, request) {
        const raw = request.token;
        if (!raw) return;
        const hash = sha256(raw);
        const row = await McpOAuthToken.findOne({
            where: {
                clientId: client.client_id,
                revokedAt: null,
                [Op.or]: [
                    {accessTokenHash: hash},
                    {refreshTokenHash: hash},
                ],
            },
        });
        if (row) await row.update({revokedAt: new Date()});
    }

    /**
     * Issues a fresh access + refresh pair and persists their hashes.
     * @param {Object} args - Subject of the grant.
     * @return {Promise<Object>} Token response body.
     */
    async #issueTokens({clientId, userId, workspaceId, scopes, resource}) {
        const accessToken = `mcp_at_${randomToken()}`;
        const refreshToken = `mcp_rt_${randomToken()}`;
        const now = Date.now();

        await McpOAuthToken.create({
            accessTokenHash: sha256(accessToken),
            refreshTokenHash: sha256(refreshToken),
            clientId,
            userId,
            workspaceId,
            scopes,
            resource: resource || null,
            accessExpiresAt: new Date(now + ACCESS_TTL_SEC * 1000),
            refreshExpiresAt: new Date(now + REFRESH_TTL_MS),
        });

        return {
            access_token: accessToken,
            token_type: 'bearer',
            expires_in: ACCESS_TTL_SEC,
            refresh_token: refreshToken,
            scope: scopes.join(' '),
        };
    }
}

/**
 * Issues an authorization code for a user who has already authenticated on the
 * consent page, and returns the redirect URL back to the MCP client.
 * @param {Object} args - Consent completion.
 * @param {Object} args.pending - Verified pending-auth payload.
 * @param {Object} args.user - Authenticated user.
 * @param {string} args.workspaceId - Chosen workspace.
 * @return {Promise<Object>} Client redirect with code.
 */
export const issueAuthorizationCode = async ({pending, user, workspaceId}) => {
    if (!pending?.clientId || !pending.redirectUri || !pending.codeChallenge) {
        const err = new Error('Authorization session expired. Start again from your MCP client.');
        err.status = 400;
        throw err;
    }

    const workspace = await Workspace.findByPk(workspaceId);
    if (!workspace) {
        const err = new Error('Workspace not found');
        err.status = 404;
        throw err;
    }

    const isOwner = workspace.userId === user.id;
    const membership = isOwner ? true : await WorkspaceTeam.findOne({
        where: {workspaceId: workspace.id, userId: user.id},
    });
    if (!membership) {
        const err = new Error('You are not a member of that workspace');
        err.status = 403;
        throw err;
    }

    const client = await McpOAuthClient.findByClientId(pending.clientId);
    if (!client) {
        const err = new Error('Unknown OAuth client');
        err.status = 400;
        throw err;
    }

    const code = `mcp_ac_${randomToken()}`;
    await McpOAuthCode.create({
        codeHash: McpOAuthCode.hash(code),
        clientId: pending.clientId,
        userId: user.id,
        workspaceId: workspace.id,
        redirectUri: pending.redirectUri,
        codeChallenge: pending.codeChallenge,
        scopes: pending.scopes?.length ? pending.scopes : MCP_SCOPES,
        resource: pending.resource || null,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });

    const target = new URL(pending.redirectUri);
    target.searchParams.set('code', code);
    if (pending.state) target.searchParams.set('state', pending.state);

    return {redirectUrl: target.toString()};
};

/**
 * Workspaces the given user can authorize an MCP client into.
 * @param {string} userId - User id.
 * @return {Promise<Array<{id: string, title: string, slug: string}>>} Options.
 */
export const listConsentWorkspaces = async (userId) => {
    const owned = await Workspace.findAll({
        where: {userId},
        attributes: ['id', 'title', 'slug'],
        order: [['title', 'ASC']],
    });
    const memberships = await WorkspaceTeam.findAll({
        where: {userId},
        include: [{
            model: Workspace,
            as: 'workspace',
            attributes: ['id', 'title', 'slug'],
        }],
    });

    const byId = new Map();
    for (const w of owned) byId.set(w.id, {id: w.id, title: w.title, slug: w.slug});
    for (const m of memberships) {
        if (m.workspace) {
            byId.set(m.workspace.id, {
                id: m.workspace.id,
                title: m.workspace.title,
                slug: m.workspace.slug,
            });
        }
    }
    return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
};

/**
 * Resolves an MCP OAuth access token to the user + workspace the tools need.
 * @param {string} rawToken - Bearer token from the request.
 * @return {Promise<{user: User, workspace: Workspace, apiKey: null}|null>}
 */
export const resolveMcpOAuthBearer = async (rawToken) => {
    if (!rawToken || !rawToken.startsWith('mcp_at_')) return null;
    const row = await McpOAuthToken.findActiveAccessToken(rawToken);
    if (!row) return null;

    const user = await User.findByPk(row.userId);
    const workspace = await Workspace.findByPk(row.workspaceId);
    if (!user || !workspace) return null;

    return {user, workspace, apiKey: null, oauthToken: row};
};

/**
 * Builds a provider instance for the auth router. Throws a clear error when
 * PUBLIC_API_URL is missing in production so misconfig surfaces at boot.
 * @return {TaskgidMcpOAuthProvider} Provider.
 */
export const createMcpOAuthProvider = () => {
    if (process.env.NODE_ENV === 'production' && !process.env.PUBLIC_API_URL) {
        throw new ServerError('PUBLIC_API_URL is required for MCP OAuth in production');
    }
    return new TaskgidMcpOAuthProvider();
};
