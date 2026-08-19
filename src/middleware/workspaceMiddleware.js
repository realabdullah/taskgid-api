import {Workspace} from '../models/Workspace.js';
import WorkspaceTeam from '../models/WorkspaceTeam.js';

/**
 * Resolves the workspace named by a request's slug, enforcing that an
 * API-key-authenticated request stays within the one workspace its key was
 * issued for — a workspace-scoped key must not reach a different workspace
 * just because the same user happens to belong to both.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Promise<Workspace|null>} The workspace, or null after writing an error response.
 */
const resolveWorkspace = async (req, res) => {
    const slug = req.params.slug || req.params.workspaceSlug;
    const workspace = await Workspace.findOne({where: {slug}});

    if (!workspace) {
        res.status(404).json({error: 'Workspace not found', success: false});
        return null;
    }

    if (req.apiKeyWorkspaceId && req.apiKeyWorkspaceId !== workspace.id) {
        res.status(403).json({error: 'This API key is not valid for this workspace', success: false});
        return null;
    }

    return workspace;
};

/**
 * Middleware to check if a user is a member of a workspace
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const checkMemberMiddleware = async (req, res, next) => {
    const workspace = await resolveWorkspace(req, res);
    if (!workspace) return;

    const membership = await WorkspaceTeam.findOne({
        where: {
            workspaceId: workspace.id,
            userId: req.user.id,
        },
    });

    if (!membership) {
        return res.status(403).json({error: 'We could not find the workspace you are looking for!', success: false});
    }
    next();
};

/**
 * Middleware to check if a user is an admin of a workspace
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const checkAdminMiddleware = async (req, res, next) => {
    const workspace = await resolveWorkspace(req, res);
    if (!workspace) return;

    if (workspace.userId === req.user.id) {
        req.isSuperAdmin = true;
        return next();
    }

    const workspaceTeam = await WorkspaceTeam.findOne({
        where: {
            workspaceId: workspace.id,
            userId: req.user.id,
            role: 'admin',
        },
    });

    if (!workspaceTeam) {
        return res.status(403).json({error: 'You do not have admin permissions for this workspace', success: false});
    }

    req.isAdmin = true;
    next();
};

/**
 * Middleware to check if a user is a super admin (creator) of a workspace
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const checkSuperAdminMiddleware = async (req, res, next) => {
    const workspace = await resolveWorkspace(req, res);
    if (!workspace) return;

    if (workspace.userId !== req.user.id) {
        return res.status(403).json({error: 'Only the workspace creator can perform this action', success: false});
    }

    req.isSuperAdmin = true;
    next();
};

export {checkMemberMiddleware, checkAdminMiddleware, checkSuperAdminMiddleware};
