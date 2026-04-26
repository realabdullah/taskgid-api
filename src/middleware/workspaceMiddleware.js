import {Workspace} from '../models/Workspace.js';
import WorkspaceTeam from '../models/WorkspaceTeam.js';

/**
 * Middleware to check if a user is a member of a workspace
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const checkMemberMiddleware = async (req, res, next) => {
    const slug = req.params.slug || req.params.workspaceSlug;
    const workspace = await Workspace.findOne({
        where: {slug},
    });

    if (!workspace) {
        return res.status(404).json({error: 'Workspace not found', success: false});
    }

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
    const slug = req.params.slug || req.params.workspaceSlug;
    const workspace = await Workspace.findOne({
        where: {slug},
    });

    if (!workspace) {
        return res.status(404).json({error: 'Workspace not found', success: false});
    }

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
    const slug = req.params.slug || req.params.workspaceSlug;
    const workspace = await Workspace.findOne({
        where: {slug},
    });

    if (!workspace) {
        return res.status(404).json({error: 'Workspace not found', success: false});
    }

    if (workspace.userId !== req.user.id) {
        return res.status(403).json({error: 'Only the workspace creator can perform this action', success: false});
    }

    req.isSuperAdmin = true;
    next();
};

export {checkMemberMiddleware, checkAdminMiddleware, checkSuperAdminMiddleware};
