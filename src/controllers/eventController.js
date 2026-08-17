/**
 * Controller for the workspace event stream.
 */
import {Workspace} from '../models/Workspace.js';
import {errorResponse} from '../utils/responseUtils.js';
import {subscribeToWorkspace} from '../services/workspaceEvents.js';

/**
 * Opens a Server-Sent Events stream of this workspace's domain events.
 *
 * Membership is enforced by checkMemberMiddleware on the route, so by the time
 * this runs the caller is known to belong to the workspace.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {void}
 */
export const streamWorkspaceEvents = async (req, res) => {
    try {
        const workspace = await Workspace.findOne({
            where: {slug: req.params.slug},
            attributes: ['id'],
        });
        if (!workspace) return errorResponse(res, 404, 'Workspace not found');

        // Never returns; the stream stays open until the client disconnects.
        return subscribeToWorkspace({req, res, workspaceId: workspace.id});
    } catch (error) {
        console.error('Workspace event stream error:', error);
        return errorResponse(res, 500, 'Failed to open the event stream.');
    }
};
