/**
 * The one configured Pusher client.
 *
 * Both the notification service and the channel authoriser previously built
 * their own, so a misconfiguration could be half-true. This exports null when
 * credentials are absent, which every caller must treat as "realtime is off"
 * rather than as an error — the app stays correct without it, falling back to
 * refetch-on-focus in the client.
 */
import Pusher from 'pusher';
import 'dotenv/config';

const {PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER} = process.env;

export const isPusherConfigured = Boolean(
    PUSHER_APP_ID && PUSHER_KEY && PUSHER_SECRET && PUSHER_CLUSTER,
);

if (!isPusherConfigured) {
    console.warn('Pusher is not configured — realtime updates are disabled.');
}

/*
 * Host and port are overridable so this can talk to any Pusher-protocol server
 * — a self-hosted Sockudo or Soketi, or a local stub in tests — without a line
 * of application code changing. Unset, it uses Pusher's own cluster.
 */
const hostOverride = process.env.PUSHER_HOST ?
    {
        host: process.env.PUSHER_HOST,
        port: Number(process.env.PUSHER_PORT || 443),
        useTLS: process.env.PUSHER_USE_TLS !== 'false',
    } :
    {cluster: PUSHER_CLUSTER, useTLS: true};

const pusherClient = isPusherConfigured ?
    new Pusher({
        appId: PUSHER_APP_ID,
        key: PUSHER_KEY,
        secret: PUSHER_SECRET,
        ...hostOverride,
    }) :
    null;

/**
 * Channel a workspace's domain events are published on.
 * @param {string} workspaceId - Workspace id.
 * @return {string} Channel name.
 */
export const workspaceChannel = (workspaceId) => `private-workspace-${workspaceId}`;

/**
 * Channel a single user's notifications are published on.
 * @param {string} userId - User id.
 * @return {string} Channel name.
 */
export const userChannel = (userId) => `private-user-${userId}`;

export default pusherClient;
