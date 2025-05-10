import Pusher from 'pusher';
import 'dotenv/config';

// Initialize Pusher instance
const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    useTLS: true,
});

/**
 * Authenticates a private Pusher channel
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @return {Response} Express response with authentication details or error message
 */
export const authenticatePusher = (req, res) => {
    try {
        const {socket_id: socketId, channel_name: channelName} = req.body;

        if (!socketId || !channelName) {
            return res.status(400).json({
                success: false,
                message: 'Socket ID and channel name are required',
            });
        }

        // Check if this is a user-specific channel
        if (channelName.startsWith('private-user-')) {
            const channelUserId = channelName.replace('private-user-', '');

            // Verify the user is requesting their own channel
            if (channelUserId !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    message: 'Unauthorized channel access',
                });
            }
        }

        // Generate auth signature
        const auth = pusher.authorizeChannel(socketId, channelName);
        return res.status(200).json(auth);
    } catch (error) {
        console.error('Pusher authentication error:', error);
        return res.status(500).json({
            success: false,
            message: 'Pusher authentication failed',
        });
    }
};
