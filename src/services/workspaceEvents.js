/**
 * Workspace realtime events, delivered over Server-Sent Events.
 *
 * SSE is chosen over a WebSocket broker because every workspace event here is
 * one-directional (server to client) and the existing JWT is enough to
 * authorise the request. No second process, no broker, no extra auth story.
 *
 * Scope: subscribers are held in this process's memory, so a single Node
 * instance serves them correctly. Running more than one instance needs a shared
 * fan-out (Postgres LISTEN/NOTIFY or Redis pub/sub) publishing into `emit`;
 * everything else here, including the client contract, stays the same.
 */
import {randomUUID} from 'crypto';

/** workspaceId -> Set of subscriber records. */
const subscribers = new Map();

/** How often a comment is written to keep proxies from closing an idle stream. */
const HEARTBEAT_MS = 25000;

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
 * @param {Object} params - Event parameters.
 * @param {string} params.workspaceId - Workspace the event belongs to.
 * @param {string} params.type - One of WORKSPACE_EVENTS.
 * @param {string} [params.actorId] - User who caused the event.
 * @param {Object} [params.payload] - Event body.
 * @return {void}
 */
export const emitWorkspaceEvent = ({workspaceId, type, actorId, payload = {}}) => {
    if (!workspaceId) return;
    const listeners = subscribers.get(workspaceId);
    if (!listeners || listeners.size === 0) return;

    const frame = `event: ${type}\ndata: ${JSON.stringify({
        eventId: randomUUID(),
        type,
        actorId: actorId ?? null,
        workspaceId,
        at: new Date().toISOString(),
        payload,
    })}\n\n`;

    for (const subscriber of listeners) {
        try {
            subscriber.res.write(frame);
        } catch {
            // A broken pipe means the client is gone; its close handler cleans up.
        }
    }
};

/**
 * Attach an SSE subscriber to a workspace for the life of the request.
 * @param {Object} params - Subscription parameters.
 * @param {Object} params.req - Express request.
 * @param {Object} params.res - Express response.
 * @param {string} params.workspaceId - Workspace to subscribe to. Callers must
 *   have already checked that the requesting user is a member of it.
 * @return {void}
 */
export const subscribeToWorkspace = ({req, res, workspaceId}) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        // Tells nginx and friends not to buffer the stream.
        'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    const subscriber = {res};
    if (!subscribers.has(workspaceId)) subscribers.set(workspaceId, new Set());
    subscribers.get(workspaceId).add(subscriber);

    // An initial frame lets the client confirm the stream is live rather than
    // waiting for the first real event.
    res.write(`event: connected\ndata: ${JSON.stringify({workspaceId, at: new Date().toISOString()})}\n\n`);

    const heartbeat = setInterval(() => {
        try {
            res.write(': keep-alive\n\n');
        } catch {
            clearInterval(heartbeat);
        }
    }, HEARTBEAT_MS);

    const cleanup = () => {
        clearInterval(heartbeat);
        const listeners = subscribers.get(workspaceId);
        if (!listeners) return;
        listeners.delete(subscriber);
        if (listeners.size === 0) subscribers.delete(workspaceId);
    };

    req.on('close', cleanup);
    req.on('error', cleanup);
};

/**
 * Current subscriber count, for diagnostics and tests.
 * @param {string} [workspaceId] - Restrict to one workspace.
 * @return {number} Number of open streams.
 */
export const subscriberCount = (workspaceId) => {
    if (workspaceId) return subscribers.get(workspaceId)?.size ?? 0;
    let total = 0;
    for (const listeners of subscribers.values()) total += listeners.size;
    return total;
};
