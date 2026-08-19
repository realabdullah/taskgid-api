/**
 * The durable half of workspace events: persistence, delivery, and retry.
 *
 * `workspaceEvents.js` publishes the same four event types to Pusher for the
 * live UI, fire-and-forget with failures swallowed — fine for a screen that
 * will just refetch. A webhook subscriber has no such fallback, so this path
 * persists the event first, in the same transaction as the row change it
 * describes, and only attempts delivery once that has committed.
 */
import {Op} from 'sequelize';
import WorkspaceEvent from '../models/WorkspaceEvent.js';
import WebhookEndpoint from '../models/WebhookEndpoint.js';
import WebhookDelivery from '../models/WebhookDelivery.js';

/** Delay before each retry, indexed by the attempt number that just failed. */
const RETRY_DELAYS_MS = [
    5 * 60 * 1000,
    30 * 60 * 1000,
    2 * 60 * 60 * 1000,
    8 * 60 * 60 * 1000,
    24 * 60 * 60 * 1000,
];

/** Total attempts a delivery gets: the synchronous first try, plus every retry. */
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/** How long a delivery attempt may take before it is treated as a failure. */
const DELIVERY_TIMEOUT_MS = 5000;

/**
 * Persists a domain event.
 * @param {Object} params - Event parameters.
 * @param {string} params.workspaceId - Workspace the event belongs to.
 * @param {string} params.type - One of WORKSPACE_EVENTS.
 * @param {string} [params.actorId] - User who caused the event.
 * @param {Object} [params.payload] - Event body.
 * @param {Object} options - Call options.
 * @param {Object} options.transaction - The transaction to write in.
 * @return {Promise<WorkspaceEvent>} The persisted event.
 */
export const persistWorkspaceEvent = async ({workspaceId, type, actorId, payload = {}}, {transaction}) => {
    return WorkspaceEvent.create({workspaceId, type, actorId: actorId ?? null, payload}, {transaction});
};

/**
 * Queues one delivery per active endpoint subscribed to this event's type.
 * @param {WorkspaceEvent} event - A just-persisted event.
 * @param {Object} options - Call options.
 * @param {Object} options.transaction - The transaction to write in.
 * @return {Promise<Array<WebhookDelivery>>} The queued deliveries, with their endpoint loaded.
 */
export const queueDeliveriesForEvent = async (event, {transaction}) => {
    const endpoints = await WebhookEndpoint.findAll({
        where: {
            workspaceId: event.workspaceId,
            isActive: true,
            eventTypes: {[Op.contains]: [event.type]},
        },
        transaction,
    });
    if (endpoints.length === 0) return [];

    const deliveries = await WebhookDelivery.bulkCreate(
        endpoints.map((endpoint) => ({
            webhookEndpointId: endpoint.id,
            workspaceEventId: event.id,
            nextAttemptAt: new Date(),
        })),
        {transaction, returning: true},
    );

    return deliveries.map((delivery, index) => {
        delivery.endpoint = endpoints[index];
        delivery.event = event;
        return delivery;
    });
};

/**
 * Attempts one delivery: signs the payload, sends it, and records the result.
 *
 * Never throws — a delivery failure is recorded on the row, not surfaced to
 * the caller, so this is safe to call from the middle of a request handler
 * without risking the response that triggered it.
 * @param {WebhookDelivery} delivery - Must have `endpoint` and `event` loaded.
 * @return {Promise<void>} Resolves once the attempt is recorded.
 */
export const attemptDelivery = async (delivery) => {
    const {endpoint, event} = delivery;
    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
        id: delivery.id,
        type: event.type,
        workspaceId: event.workspaceId,
        actorId: event.actorId,
        createdAt: event.createdAt,
        payload: event.payload,
    });
    const signature = endpoint.sign(String(timestamp), body);

    let statusCode = null;
    let error = null;

    try {
        const response = await fetch(endpoint.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Taskgid-Event': event.type,
                'X-Taskgid-Delivery': delivery.id,
                'X-Taskgid-Signature': `t=${timestamp},v1=${signature}`,
            },
            body,
            redirect: 'manual',
            signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
        });
        statusCode = response.status;
        if (response.status < 200 || response.status >= 300) {
            error = `Endpoint responded ${response.status}`;
        }
    } catch (caught) {
        error = caught.name === 'TimeoutError' ? 'Timed out' : caught.message;
    }

    const attemptCount = delivery.attemptCount + 1;
    const succeeded = statusCode !== null && !error;
    const exhausted = attemptCount >= MAX_ATTEMPTS;

    await delivery.update({
        attemptCount,
        status: succeeded ? 'succeeded' : exhausted ? 'failed' : 'pending',
        nextAttemptAt: succeeded || exhausted ? null : new Date(Date.now() + RETRY_DELAYS_MS[attemptCount - 1]),
        lastStatusCode: statusCode,
        lastError: error,
        lastAttemptedAt: new Date(),
    });

    await endpoint.update({lastUsedAt: new Date()});
};

/**
 * Fires the first attempt at every delivery just queued for an event.
 *
 * Runs after the triggering write has committed, and in parallel across
 * endpoints, so one slow or unreachable endpoint does not delay another.
 * @param {Array<WebhookDelivery>} deliveries - From `queueDeliveriesForEvent`.
 * @return {Promise<void>} Resolves once every attempt has been recorded.
 */
export const dispatchQueuedDeliveries = async (deliveries) => {
    await Promise.allSettled(deliveries.map(attemptDelivery));
};

/**
 * Retries every delivery whose backoff window has elapsed.
 * @return {Promise<{attempted: number}>} How many deliveries were retried.
 */
export const retryDueDeliveries = async () => {
    const due = await WebhookDelivery.findAll({
        where: {status: 'pending', nextAttemptAt: {[Op.lte]: new Date()}},
        include: [
            {model: WebhookEndpoint, as: 'endpoint'},
            {model: WorkspaceEvent, as: 'event'},
        ],
    });

    for (const delivery of due) {
        await attemptDelivery(delivery);
    }

    return {attempted: due.length};
};
