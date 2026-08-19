import ApiKey from '../models/ApiKey.js';
import User from '../models/User.js';
import {Workspace} from '../models/Workspace.js';
import WorkspaceTeam from '../models/WorkspaceTeam.js';
import {errorResponse, successResponse} from '../utils/responseUtils.js';

const ADMIN_ROLES = ['admin', 'creator'];

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
 * Whether the requester administers this workspace.
 * @param {string} userId - The requester.
 * @param {Workspace} workspace - The workspace.
 * @return {Promise<boolean>} True for the creator or an admin member.
 */
const isWorkspaceAdmin = async (userId, workspace) => {
    if (workspace.userId === userId) return true;
    const membership = await WorkspaceTeam.findOne({where: {workspaceId: workspace.id, userId}});
    return Boolean(membership && ADMIN_ROLES.includes(membership.role));
};

/**
 * Lists API keys in the workspace: every key for an admin, only the
 * requester's own otherwise. Key material is never included.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Response with the key list.
 */
export const listApiKeys = async (req, res) => {
    const workspace = await loadWorkspace(req, res);
    if (!workspace) return;

    const admin = await isWorkspaceAdmin(req.user.id, workspace);
    const keys = await ApiKey.findAll({
        where: admin ? {workspaceId: workspace.id} : {workspaceId: workspace.id, userId: req.user.id},
        attributes: {exclude: ['keyHash']},
        include: [{model: User, as: 'owner', attributes: ['id', 'username', 'firstName', 'lastName']}],
        order: [['createdAt', 'DESC']],
    });
    return successResponse(res, {data: keys});
};

/**
 * Creates an API key for the requesting user, scoped to this workspace.
 *
 * The response carries the raw key once; it is never returned again.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Response with the created key, including its raw value.
 */
export const createApiKey = async (req, res) => {
    const workspace = await loadWorkspace(req, res);
    if (!workspace) return;

    const name = (req.body.name || '').trim();
    if (!name) return errorResponse(res, 400, 'A name is required to tell this key apart from others');
    if (name.length > 100) return errorResponse(res, 400, 'Name cannot exceed 100 characters');

    const key = ApiKey.build({workspaceId: workspace.id, userId: req.user.id, name});
    const rawKey = key.generateKey();
    await key.save();

    return successResponse(res, {data: {...key.toJSON(), key: rawKey}}, 201);
};

/**
 * Revokes an API key. Its owner may always revoke it; a workspace admin may
 * revoke anyone's.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Response confirming revocation.
 */
export const revokeApiKey = async (req, res) => {
    const workspace = await loadWorkspace(req, res);
    if (!workspace) return;

    const key = await ApiKey.findOne({where: {id: req.params.id, workspaceId: workspace.id}});
    if (!key) return errorResponse(res, 404, 'API key not found');

    if (key.userId !== req.user.id && !(await isWorkspaceAdmin(req.user.id, workspace))) {
        return errorResponse(res, 403, 'Only the key\'s owner or a workspace admin can revoke it');
    }

    if (!key.revokedAt) await key.update({revokedAt: new Date()});
    return successResponse(res, {message: 'API key revoked'});
};
