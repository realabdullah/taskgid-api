import 'dotenv/config';
import pusherClient, {isPusherConfigured, userChannel} from '../utils/pusherClient.js';
import {getUserRoleInWorkspace} from '../utils/workspaceUtils.js';

/** `private-workspace-{uuid}` — captures the workspace id. */
const WORKSPACE_CHANNEL = /^private-workspace-([0-9a-f-]{36})$/i;

/**
 * Decides whether the requesting user may subscribe to a channel.
 *
 * This is the security boundary for realtime: a member of workspace A must
 * never be able to subscribe to workspace B and watch its tasks go by. Anything
 * not explicitly allowed here is refused.
 * @param {Object} user - The authenticated user.
 * @param {string} channelName - Channel being requested.
 * @return {Promise<boolean>} True when the subscription is permitted.
 */
const canAccessChannel = async (user, channelName) => {
    if (channelName === userChannel(user.id)) return true;

    const workspaceMatch = channelName.match(WORKSPACE_CHANNEL);
    if (workspaceMatch) {
        const role = await getUserRoleInWorkspace(user.id, workspaceMatch[1]);
        return Boolean(role);
    }

    return false;
};

/**
 * Authenticates a private Pusher channel
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @return {Response} Express response with authentication details or error message
 */
export const authenticatePusher = async (req, res) => {
    try {
        const {socket_id: socketId, channel_name: channelName} = req.body;

        if (!socketId || !channelName) {
            return res.status(400).json({
                success: false,
                message: 'Socket ID and channel name are required',
            });
        }

        // Authorisation is decided before configuration, so the security check
        // is never skipped by a server that happens to be missing credentials.
        if (!(await canAccessChannel(req.user, channelName))) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized channel access',
            });
        }

        if (!isPusherConfigured) {
            return res.status(503).json({
                success: false,
                message: 'Realtime is not configured on this server',
            });
        }

        const auth = pusherClient.authorizeChannel(socketId, channelName);
        return res.status(200).json(auth);
    } catch (error) {
        console.error('Pusher authentication error:', error);
        return res.status(500).json({
            success: false,
            message: 'Pusher authentication failed',
        });
    }
};
