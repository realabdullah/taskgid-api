/**
 * Workspace realtime events, published to Pusher.
 *
 * This started as Server-Sent Events held open by the API process, which cannot
 * work on Vercel: the invocation holding a stream and the invocation publishing
 * an event are separate processes with separate memory, so nothing was ever
 * delivered. Pusher inverts that — the persistent connection lives on Pusher's
 * side, and this code only makes a stateless HTTP call, which is exactly the
 * shape a serverless function can do.
 *
 * When Pusher is unconfigured, publishing is a silent no-op. Realtime is an
 * enhancement; the client stays correct through refetch-on-window-focus.
 */
import {randomUUID} from 'crypto';
import pusherClient, {isPusherConfigured, workspaceChannel} from '../utils/pusherClient.js';

export const WORKSPACE_EVENTS = {
    TASK_CREATED: 'task.created',
    TASK_UPDATED: 'task.updated',
    TASK_DELETED: 'task.deleted',
    COMMENT_CREATED: 'comment.created',
};

/**
 * Publish an event to everyone watching a workspace.
 *
 * Every event carries a stable `eventId` and the acting user's id, so a client
 * can ignore the echo of its own change and de-duplicate re-deliveries.
 *
 * Failures are swallowed deliberately: a realtime hiccup must never turn a
 * successful write into a failed request for the user who made it.
 * @param {Object} params - Event parameters.
 * @param {string} params.workspaceId - Workspace the event belongs to.
 * @param {string} params.type - One of WORKSPACE_EVENTS.
 * @param {string} [params.actorId] - User who caused the event.
 * @param {Object} [params.payload] - Event body.
 * @return {Promise<void>} Resolves once published, or immediately when disabled.
 */
export const emitWorkspaceEvent = async ({workspaceId, type, actorId, payload = {}}) => {
    if (!workspaceId || !isPusherConfigured) return;

    try {
        await pusherClient.trigger(workspaceChannel(workspaceId), type, {
            eventId: randomUUID(),
            type,
            actorId: actorId ?? null,
            workspaceId,
            at: new Date().toISOString(),
            payload,
        });
    } catch (error) {
        console.error(`Failed to publish ${type} for workspace ${workspaceId}:`, error.message);
    }
};

export default {WORKSPACE_EVENTS, emitWorkspaceEvent};
