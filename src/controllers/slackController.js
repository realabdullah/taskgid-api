import SlackInstallation, {DEFAULT_SLACK_EVENT_TYPES} from '../models/SlackInstallation.js';
import {Workspace} from '../models/Workspace.js';
import {
    buildAuthorizeUrl,
    completeOAuth,
    handleInteraction,
    isSlackConfigured,
    listChannels,
    oauthReturnUrl,
    verifyOAuthState,
    verifySlackSignature,
} from '../services/slackService.js';
import {errorResponse, successResponse} from '../utils/responseUtils.js';

/**
 * Loads the workspace for a request, or writes a 404 and returns null.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Promise<Workspace|null>} The workspace, or null after responding.
 */
const loadWorkspace = async (req, res) => {
    const workspace = await Workspace.findOne({where: {slug: req.params.workspaceSlug}});
    if (!workspace) {
        errorResponse(res, 404, 'Workspace not found');
        return null;
    }
    return workspace;
};

/**
 * Whether Slack app credentials are configured on this deployment.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Response with `{configured}`.
 */
export const getSlackStatus = async (req, res) => {
    return successResponse(res, {configured: isSlackConfigured()});
};

/**
 * Returns the current Slack installation for a workspace, if any.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Response with the installation or null.
 */
export const getSlackInstallation = async (req, res) => {
    const workspace = await loadWorkspace(req, res);
    if (!workspace) return;

    const installation = await SlackInstallation.findOne({
        where: {workspaceId: workspace.id},
    });

    return successResponse(res, {
        data: installation ? installation.toJSON() : null,
        configured: isSlackConfigured(),
    });
};

/**
 * Starts the Slack OAuth install for a workspace. Returns the authorize URL
 * so the client can navigate there (popup or full redirect).
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Response with `{url}`.
 */
export const startSlackOAuth = async (req, res) => {
    if (!isSlackConfigured()) {
        return errorResponse(res, 503, 'Slack is not configured on this server');
    }

    const workspace = await loadWorkspace(req, res);
    if (!workspace) return;

    const url = buildAuthorizeUrl({
        workspaceId: workspace.id,
        userId: req.user.id,
    });
    return successResponse(res, {data: {url}});
};

/**
 * Slack OAuth callback. Exchanges the code, saves the installation, and
 * redirects the browser back to workspace settings.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {void}
 */
export const slackOAuthCallback = async (req, res) => {
    const {code, state, error: slackError} = req.query;

    const claims = typeof state === 'string' ? verifyOAuthState(state) : null;
    if (!claims) {
        return res.redirect(oauthReturnUrl('unknown', 'error', 'invalid_state'));
    }

    const workspace = await Workspace.findByPk(claims.workspaceId);
    if (!workspace) {
        return res.redirect(oauthReturnUrl('unknown', 'error', 'workspace_missing'));
    }

    if (slackError) {
        return res.redirect(oauthReturnUrl(workspace.slug, 'error', String(slackError)));
    }

    if (!code || typeof code !== 'string') {
        return res.redirect(oauthReturnUrl(workspace.slug, 'error', 'missing_code'));
    }

    try {
        await completeOAuth({
            code,
            workspaceId: claims.workspaceId,
            userId: claims.userId,
        });
        return res.redirect(oauthReturnUrl(workspace.slug, 'connected'));
    } catch (error) {
        console.error('Slack OAuth callback failed:', error.message);
        return res.redirect(oauthReturnUrl(workspace.slug, 'error', 'oauth_failed'));
    }
};

/**
 * Lists channels the bot can post to.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Response with channel list.
 */
export const getSlackChannels = async (req, res) => {
    const workspace = await loadWorkspace(req, res);
    if (!workspace) return;

    const installation = await SlackInstallation.findOne({
        where: {workspaceId: workspace.id, isActive: true},
    });
    if (!installation) return errorResponse(res, 404, 'Slack is not connected');

    try {
        const channels = await listChannels(installation);
        return successResponse(res, {data: channels});
    } catch (error) {
        console.error('Slack list channels failed:', error.message);
        return errorResponse(res, error.status || 502, error.message || 'Failed to list Slack channels');
    }
};

/**
 * Updates channel, subscribed events, or active state on the installation.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Response with the updated installation.
 */
export const updateSlackInstallation = async (req, res) => {
    const workspace = await loadWorkspace(req, res);
    if (!workspace) return;

    const installation = await SlackInstallation.findOne({
        where: {workspaceId: workspace.id},
    });
    if (!installation) return errorResponse(res, 404, 'Slack is not connected');

    if (req.body.channelId !== undefined) {
        const channelId = req.body.channelId === null || req.body.channelId === '' ?
            null :
            String(req.body.channelId);

        if (channelId) {
            try {
                const channels = await listChannels(installation);
                const match = channels.find((channel) => channel.id === channelId);
                if (!match) {
                    return errorResponse(res, 400, 'That channel is not visible to the Taskgid bot');
                }
                installation.channelId = match.id;
                installation.channelName = match.name;
            } catch (error) {
                console.error('Slack channel lookup failed:', error.message);
                return errorResponse(res, 502, 'Could not verify the Slack channel');
            }
        } else {
            installation.channelId = null;
            installation.channelName = null;
        }
    }

    if (req.body.eventTypes !== undefined) {
        installation.eventTypes = req.body.eventTypes;
    }
    if (req.body.isActive !== undefined) {
        installation.isActive = req.body.isActive;
    }

    await installation.save();
    return successResponse(res, {data: installation.toJSON()});
};

/**
 * Disconnects Slack from the workspace and drops the bot token.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Response confirming removal.
 */
export const disconnectSlack = async (req, res) => {
    const workspace = await loadWorkspace(req, res);
    if (!workspace) return;

    const deleted = await SlackInstallation.destroy({
        where: {workspaceId: workspace.id},
    });
    if (!deleted) return errorResponse(res, 404, 'Slack is not connected');

    return successResponse(res, {message: 'Slack disconnected'});
};

/**
 * Slack interactivity endpoint (button clicks). Verifies the signature, then
 * runs the action. Responds within Slack's 3s window.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Slack response body.
 */
export const slackInteractions = async (req, res) => {
    const signature = req.headers['x-slack-signature'];
    const timestamp = req.headers['x-slack-request-timestamp'];
    const rawBody = req.rawBody;

    if (!rawBody || !verifySlackSignature({signature, timestamp, rawBody})) {
        return res.status(401).send('Invalid signature');
    }

    let payload;
    try {
        const encoded = typeof req.body?.payload === 'string' ?
            req.body.payload :
            (typeof rawBody === 'string' ? new URLSearchParams(rawBody).get('payload') : null);
        payload = JSON.parse(encoded);
    } catch {
        return res.status(400).send('Invalid payload');
    }

    try {
        const result = await handleInteraction(payload);
        return res.status(200).json(result);
    } catch (error) {
        console.error('Slack interaction failed:', error.message);
        return res.status(200).json({text: 'Something went wrong handling that action.'});
    }
};

export {DEFAULT_SLACK_EVENT_TYPES};
