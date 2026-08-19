import WebhookEndpoint from '../models/WebhookEndpoint.js';
import WebhookDelivery from '../models/WebhookDelivery.js';
import WorkspaceEvent from '../models/WorkspaceEvent.js';
import {Workspace} from '../models/Workspace.js';
import {errorResponse, successResponse} from '../utils/responseUtils.js';
import {validateWebhookUrl} from '../utils/webhookUrl.js';
import {getPaginationParams, createPaginatedResponse} from '../utils/pagination.js';

const DEFAULT_EVENT_TYPES = ['task.created', 'task.updated', 'task.deleted', 'comment.created'];

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
 * Lists a workspace's webhook endpoints. Secrets are never included.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Response with the endpoint list.
 */
export const listWebhookEndpoints = async (req, res) => {
    const workspace = await loadWorkspace(req, res);
    if (!workspace) return;

    const endpoints = await WebhookEndpoint.findAll({
        where: {workspaceId: workspace.id},
        attributes: {exclude: ['secret']},
        order: [['createdAt', 'DESC']],
    });
    return successResponse(res, {data: endpoints});
};

/**
 * Creates a webhook endpoint.
 *
 * The response carries the raw secret once; it is never returned again.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Response with the created endpoint, including its secret.
 */
export const createWebhookEndpoint = async (req, res) => {
    const workspace = await loadWorkspace(req, res);
    if (!workspace) return;

    const urlError = validateWebhookUrl(req.body.url);
    if (urlError) return errorResponse(res, 400, urlError);

    const endpoint = WebhookEndpoint.build({
        workspaceId: workspace.id,
        url: req.body.url,
        description: req.body.description || null,
        eventTypes: req.body.eventTypes || DEFAULT_EVENT_TYPES,
        createdById: req.user.id,
    });
    endpoint.rotateSecret();
    await endpoint.save();

    // toJSON() strips the secret by default; this is the one response that
    // deliberately carries it.
    return successResponse(res, {data: {...endpoint.toJSON(), secret: endpoint.secret}}, 201);
};

/**
 * Updates a webhook endpoint's URL, description, subscribed events, or active state.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Response with the updated endpoint.
 */
export const updateWebhookEndpoint = async (req, res) => {
    const workspace = await loadWorkspace(req, res);
    if (!workspace) return;

    const endpoint = await WebhookEndpoint.findOne({
        where: {id: req.params.id, workspaceId: workspace.id},
    });
    if (!endpoint) return errorResponse(res, 404, 'Webhook endpoint not found');

    if (req.body.url !== undefined) {
        const urlError = validateWebhookUrl(req.body.url);
        if (urlError) return errorResponse(res, 400, urlError);
        endpoint.url = req.body.url;
    }
    if (req.body.description !== undefined) endpoint.description = req.body.description;
    if (req.body.eventTypes !== undefined) endpoint.eventTypes = req.body.eventTypes;
    if (req.body.isActive !== undefined) endpoint.isActive = req.body.isActive;

    await endpoint.save();

    return successResponse(res, {data: endpoint.toJSON()});
};

/**
 * Issues a new signing secret for an endpoint, invalidating the previous one.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Response with the new secret.
 */
export const rotateWebhookSecret = async (req, res) => {
    const workspace = await loadWorkspace(req, res);
    if (!workspace) return;

    const endpoint = await WebhookEndpoint.findOne({
        where: {id: req.params.id, workspaceId: workspace.id},
    });
    if (!endpoint) return errorResponse(res, 404, 'Webhook endpoint not found');

    endpoint.rotateSecret();
    await endpoint.save();

    return successResponse(res, {data: {...endpoint.toJSON(), secret: endpoint.secret}});
};

/**
 * Deletes a webhook endpoint and its delivery history.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Response confirming deletion.
 */
export const deleteWebhookEndpoint = async (req, res) => {
    const workspace = await loadWorkspace(req, res);
    if (!workspace) return;

    const deleted = await WebhookEndpoint.destroy({
        where: {id: req.params.id, workspaceId: workspace.id},
    });
    if (!deleted) return errorResponse(res, 404, 'Webhook endpoint not found');

    return successResponse(res, {message: 'Webhook endpoint deleted'});
};

/**
 * Lists an endpoint's delivery attempts, most recent first.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Response with paginated deliveries or error.
 */
export const listWebhookDeliveries = async (req, res) => {
    const workspace = await loadWorkspace(req, res);
    if (!workspace) return;

    const endpoint = await WebhookEndpoint.findOne({
        where: {id: req.params.id, workspaceId: workspace.id},
    });
    if (!endpoint) return errorResponse(res, 404, 'Webhook endpoint not found');

    const {page, limit, offset} = getPaginationParams(req.query);
    const {count, rows: deliveries} = await WebhookDelivery.findAndCountAll({
        where: {webhookEndpointId: endpoint.id},
        include: [{model: WorkspaceEvent, as: 'event', attributes: ['type', 'createdAt']}],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
    });

    return successResponse(res, createPaginatedResponse(deliveries, count, page, limit));
};
