/* eslint-disable require-jsdoc */
import {Workspace} from '../models/Workspace.js';
import User from '../models/User.js';
import 'dotenv/config';
import WorkspaceTeam from '../models/WorkspaceTeam.js';
import {getPaginationParams, createPaginatedResponse} from '../utils/pagination.js';
import {getUserRoleInWorkspace} from '../utils/workspaceUtils.js';

// Helper for standardized error responses
const errorResponse = (res, status, message) => res.status(status).json({error: message, success: false});

export const getWorkspaces = async (req, res) => {
    const {page, limit, offset} = getPaginationParams(req);

    try {
        const {count, rows: workspaces} = await Workspace.findAndCountAll({
            include: [{
                model: User,
                as: 'team',
                where: {id: req.user.id},
                attributes: [],
                through: {attributes: []},
            }],
            limit,
            offset,
            order: [['createdAt', 'DESC']],
            distinct: true,
        });

        res.json(createPaginatedResponse(workspaces, count, page, limit));
    } catch (error) {
        console.error('Error fetching workspaces:', error);
        return errorResponse(res, 500, 'Failed to fetch workspaces');
    }
};

export const getWorkspace = async (req, res) => {
    const workspaceId = req.params.id;
    const userId = req.user.id;

    try {
        const role = await getUserRoleInWorkspace(userId, workspaceId);
        if (!role) {
            const workspaceExists = await Workspace.findByPk(workspaceId, {attributes: ['id']});
            return errorResponse(
                res,
                workspaceExists ? 403 : 404,
                workspaceExists ? 'Access denied' : 'Workspace not found',
            );
        }

        const workspace = await Workspace.findByPk(workspaceId, {
            include: [
                {model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'profilePicture']},
            ],
        });

        if (!workspace) {
            return errorResponse(res, 404, 'Workspace not found');
        }

        res.json(workspace);
    } catch (error) {
        console.error('Error fetching workspace:', error);
        return errorResponse(res, 500, 'Failed to fetch workspace');
    }
};

export const getWorkspaceTeam = async (req, res) => {
    const {page, limit, offset} = getPaginationParams(req);
    const workspaceId = req.params.id;
    const userId = req.user.id;

    try {
        const role = await getUserRoleInWorkspace(userId, workspaceId);
        if (!role) {
            const workspaceExists = await Workspace.findByPk(workspaceId, {attributes: ['id']});
            return errorResponse(
                res,
                workspaceExists ? 403 : 404,
                workspaceExists ? 'Access denied' : 'Workspace not found',
            );
        }

        const {count, rows: teamMemberships} = await WorkspaceTeam.findAndCountAll({
            where: {workspaceId},
            include: [{
                model: User,
                as: 'memberDetail',
                attributes: ['id', 'firstName', 'lastName', 'email', 'profilePicture', 'username'],
            }],
            limit,
            offset,
            order: [[{model: User, as: 'memberDetail'}, 'firstName', 'ASC']],
            distinct: true,
        });

        const team = teamMemberships.map((tm) => ({
            ...(tm.memberDetail.toJSON()),
            role: tm.role,
        }));

        res.json(createPaginatedResponse(team, count, page, limit));
    } catch (error) {
        console.error('Error fetching workspace team:', error);
        return errorResponse(res, 500, 'Failed to fetch workspace team');
    }
};

export const updateWorkspace = async (req, res) => {
    const workspaceId = req.params.id;
    const userId = req.user.id;

    try {
        const workspace = await Workspace.findByPk(workspaceId);

        if (!workspace) {
            return errorResponse(res, 404, 'Workspace not found');
        }

        if (workspace.userId !== userId) {
            return errorResponse(res, 403, 'Only the workspace creator can update workspace details');
        }

        const payload = req.body;

        if (payload.slug && payload.slug !== workspace.slug) {
            const slugExists = await Workspace.count({where: {slug: payload.slug}});
            if (slugExists > 0) {
                return errorResponse(res, 400, 'A workspace with this slug already exists');
            }
        }

        await workspace.update(payload);

        const updatedWorkspace = await Workspace.findByPk(workspace.id, {
            include: [
                {model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'profilePicture']},
            ],
        });

        res.json({success: true, workspace: updatedWorkspace});
    } catch (error) {
        console.error('Update workspace error:', error);
        return errorResponse(res, 500, error.message || 'Failed to update workspace');
    }
};

export const deleteWorkspace = async (req, res) => {
    const workspaceId = req.params.id;
    const userId = req.user.id;

    try {
        const workspace = await Workspace.findByPk(workspaceId);

        if (!workspace) {
            return errorResponse(res, 404, 'Workspace not found');
        }

        if (workspace.userId !== userId) {
            return errorResponse(res, 403, 'Only the workspace creator can delete the workspace');
        }

        await workspace.destroy();
        res.json({success: true, message: 'Workspace deleted successfully'});
    } catch (error) {
        console.error('Delete workspace error:', error);
        return errorResponse(res, 500, 'Failed to delete workspace');
    }
};

export const addNewWorkspace = async (req, res) => {
    try {
        const payload = {...req.body, userId: req.user.id};

        if (payload.slug) {
            const slugExists = await Workspace.count({where: {slug: payload.slug}});
            if (slugExists > 0) {
                return errorResponse(res, 400, 'A workspace with this slug already exists');
            }
        } else {
            payload.slug = payload.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            let uniqueSlug = payload.slug;
            let counter = 1;
            while (await Workspace.count({where: {slug: uniqueSlug}}) > 0) {
                uniqueSlug = `${payload.slug}-${counter++}`;
            }
            payload.slug = uniqueSlug;
        }

        const workspace = await Workspace.create(payload);

        await WorkspaceTeam.create({
            workspaceId: workspace.id,
            userId: req.user.id,
            role: 'creator',
        });

        const populatedWorkspace = await Workspace.findByPk(workspace.id, {
            include: [
                {model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'profilePicture']},
            ],
        });

        res.status(201).json({success: true, workspace: populatedWorkspace});
    } catch (error) {
        console.error('Add workspace error:', error);
        return errorResponse(res, 500, error.message || 'Failed to create workspace');
    }
};

export const addTeamMember = async (req, res) => {
    const workspaceId = req.params.id;
    const requestorId = req.user.id;
    const {email} = req.body;

    try {
        const requestorRole = await getUserRoleInWorkspace(requestorId, workspaceId);
        if (!requestorRole || !['creator', 'admin'].includes(requestorRole)) {
            return errorResponse(res, 403, 'Only workspace admins or the creator can add members');
        }

        const userToAdd = await User.findOne({where: {email}});
        if (!userToAdd) {
            return errorResponse(res, 404, 'User to add not found');
        }

        const existingRole = await getUserRoleInWorkspace(userToAdd.id, workspaceId);
        if (existingRole) {
            return errorResponse(res, 400, 'User is already a member of this workspace');
        }

        await WorkspaceTeam.create({
            workspaceId,
            userId: userToAdd.id,
            role: 'member',
        });

        res.status(201).json({success: true, message: 'Team member added successfully'});
    } catch (error) {
        console.error('Add team member error:', error);
        return errorResponse(res, 500, 'Failed to add team member');
    }
};

export const removeTeamMember = async (req, res) => {
    const workspaceId = req.params.id;
    const {userIdToRemove} = req.params;
    const requestorId = req.user.id;

    try {
        const requestorRole = await getUserRoleInWorkspace(requestorId, workspaceId);
        const targetRole = await getUserRoleInWorkspace(userIdToRemove, workspaceId);
        const workspace = await Workspace.findByPk(workspaceId, {attributes: ['userId']});

        if (!workspace) return errorResponse(res, 404, 'Workspace not found');
        if (!targetRole) return errorResponse(res, 404, 'Team member not found in this workspace');

        if (!requestorRole || !['creator', 'admin'].includes(requestorRole)) {
            return errorResponse(res, 403, 'Only workspace admins or the creator can remove members');
        }

        if (userIdToRemove === workspace.userId) {
            return errorResponse(res, 400, 'Cannot remove the workspace creator');
        }

        if (requestorRole === 'admin' && targetRole === 'admin') {
            return errorResponse(res, 403, 'Admins cannot remove other admins');
        }

        const deletedCount = await WorkspaceTeam.destroy({
            where: {workspaceId, userId: userIdToRemove},
        });
        if (deletedCount === 0) {
            return errorResponse(res, 404, 'Team member not found in this workspace');
        }
        res.json({success: true, message: 'Team member removed successfully'});
    } catch (error) {
        console.error('Remove team member error:', error);
        return errorResponse(res, 500, 'Failed to remove team member');
    }
};

export const promoteToAdmin = async (req, res) => {
    const workspaceId = req.params.id;
    const {userId: targetUserId} = req.params;
    const requestorId = req.user.id;

    try {
        const workspace = await Workspace.findByPk(workspaceId, {attributes: ['userId']});
        if (!workspace) return errorResponse(res, 404, 'Workspace not found');

        if (workspace.userId !== requestorId) {
            return errorResponse(res, 403, 'Only the workspace creator can manage admin roles');
        }

        const teamMember = await WorkspaceTeam.findOne({
            where: {workspaceId, userId: targetUserId},
        });
        if (!teamMember) return errorResponse(res, 404, 'User is not a member of this workspace');
        if (teamMember.role === 'creator') return errorResponse(res, 400, 'Cannot change the creator\'s role');
        if (teamMember.role === 'admin') return errorResponse(res, 400, 'User is already an admin');

        await teamMember.update({role: 'admin'});
        res.json({success: true, message: 'Member promoted to admin successfully'});
    } catch (error) {
        console.error('Promote admin error:', error);
        return errorResponse(res, 500, 'Failed to promote member to admin');
    }
};

export const demoteFromAdmin = async (req, res) => {
    const workspaceId = req.params.id;
    const {userId: targetUserId} = req.params;
    const requestorId = req.user.id;

    try {
        const workspace = await Workspace.findByPk(workspaceId, {attributes: ['userId']});
        if (!workspace) return errorResponse(res, 404, 'Workspace not found');

        if (workspace.userId !== requestorId) {
            return errorResponse(res, 403, 'Only the workspace creator can manage admin roles');
        }

        if (targetUserId === workspace.userId) {
            return errorResponse(res, 400, 'Cannot change the workspace creator\'s role');
        }

        const teamMember = await WorkspaceTeam.findOne({
            where: {workspaceId, userId: targetUserId},
        });
        if (!teamMember) return errorResponse(res, 404, 'User is not a member of this workspace');
        if (teamMember.role !== 'admin') return errorResponse(res, 400, 'User is not currently an admin');

        await teamMember.update({role: 'member'});
        res.json({success: true, message: 'Admin demoted to member successfully'});
    } catch (error) {
        console.error('Demote admin error:', error);
        return errorResponse(res, 500, 'Failed to demote admin to member');
    }
};
