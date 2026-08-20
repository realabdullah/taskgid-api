import express from 'express';
import {
    disconnectSlack,
    getSlackChannels,
    getSlackInstallation,
    getSlackStatus,
    slackInteractions,
    slackOAuthCallback,
    startSlackOAuth,
    updateSlackInstallation,
} from '../controllers/slackController.js';
import {validateSlackInstallationUpdate} from '../middleware/validationMiddleware.js';

// eslint-disable-next-line new-cap
const workspaceRouter = express.Router({mergeParams: true});

// Parent mounts auth + admin.
workspaceRouter.get('/', getSlackInstallation);
workspaceRouter.get('/status', getSlackStatus);
workspaceRouter.post('/connect', startSlackOAuth);
workspaceRouter.get('/channels', getSlackChannels);
workspaceRouter.patch('/', validateSlackInstallationUpdate, updateSlackInstallation);
workspaceRouter.delete('/', disconnectSlack);

// eslint-disable-next-line new-cap
const publicRouter = express.Router();

publicRouter.get('/oauth/callback', slackOAuthCallback);
publicRouter.post('/interactions', slackInteractions);

/**
 * Workspace-scoped Slack management. Mount under
 * `/workspaces/:workspaceSlug/slack` after auth + admin checks.
 */
export const slackWorkspaceRoutes = workspaceRouter;

/**
 * Unauthenticated Slack callbacks (OAuth redirect + interactivity).
 * Mount at `/slack`.
 */
export default publicRouter;
