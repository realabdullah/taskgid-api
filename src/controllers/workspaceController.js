/* eslint-disable require-jsdoc */
import {Workspace} from '../models/Workspace.js';
import User from '../models/User.js';
import {getPaginationParams, createPaginatedResponse} from '../utils/pagination.js';
import cache from '../utils/cache.js';
import 'dotenv/config';
import {Op} from 'sequelize';
import WorkspaceTeam from '../models/WorkspaceTeam.js';

export const getWorkspaces = async (req, res) => {
    try {
        const {page, limit, offset} = getPaginationParams(req.query);

        // First, get all workspace IDs where the user is a team member
        const teamWorkspaces = await WorkspaceTeam.findAll({
            where: {userId: req.user.id},
            attributes: ['workspaceId'],
            raw: true,
        });

        const teamWorkspaceIds = teamWorkspaces.map((w) => w.workspaceId);

        // Get workspaces where user is either the owner or a team member
        const {count, rows: workspaces} = await Workspace.findAndCountAll({
            include: [
                {model: User, as: 'user', attributes: ['firstName', 'lastName']},
                {
                    model: User,
                    as: 'team',
                    attributes: ['firstName', 'lastName', 'username', 'profilePicture', 'email'],
                    through: {attributes: []},
                },
            ],
            where: {
                [Op.or]: [
                    {userId: req.user.id}, // User is the owner
                    {id: {[Op.in]: teamWorkspaceIds}}, // User is a team member
                ],
            },
            distinct: true,
            limit,
            offset,
        });

        const response = createPaginatedResponse(workspaces, count, page, limit, 'workspaces');
        res.send(response);
    } catch (error) {
        console.error('Error fetching workspaces:', error);
        res.status(500).json({error: error.message, success: false});
    }
};

export const getWorkspace = async (req, res) => {
    try {
        const {slug} = req.params;

        // Check cache first
        const cacheKey = `workspace:${slug}`;
        const cachedWorkspace = cache.get(cacheKey);

        if (cachedWorkspace) {
            return res.json({success: true, workspace: cachedWorkspace, fromCache: true});
        }

        const workspace = await Workspace.findOne({
            where: {
                slug: slug,
            },
            include: [
                {model: User, as: 'user', attributes: ['firstName', 'lastName']},
                {model: User, as: 'team', attributes: ['firstName', 'lastName', 'username', 'profilePicture', 'email']},
            ],
        });

        if (!workspace) {
            return res.status(404).json({error: 'Workspace not found', success: false});
        }

        // Cache the workspace for 5 minutes
        cache.set(cacheKey, workspace, 300);

        res.json({success: true, workspace});
    } catch (error) {
        res.status(500).json({error: error.message, success: false});
    }
};

const getUserIds = async (team) => {
    const userIds = [];

    for (const member of team) {
        const user = await User.findOne({where: {email: member.email}});
        if (user) userIds.push(user.id);
    }

    return userIds;
};

export const updateWorkspace = async (req, res) => {
    try {
        const payload = req.body;
        const userIds = await getUserIds(payload.team);
        payload.team = userIds;

        if (payload.slug !== req.params.slug) {
            const slugExists = await checkIfSlugExists(payload.slug);
            if (slugExists) {
                return res.status(400).json({error: 'A workspace with this slug already exists', success: false});
            }
        }

        const workspace = await Workspace.findOne({
            where: {
                slug: req.params.slug,
            },
        });

        if (!workspace) {
            return res.status(404).json({error: 'Workspace not found', success: false});
        }

        // Only super admin (creator) can update workspace details
        if (workspace.userId !== req.user.id) {
            return res.status(403).json({
                error: 'Only the workspace creator can update workspace details',
                success: false,
            });
        }

        await workspace.update(payload);

        const updatedWorkspace = await Workspace.findByPk(workspace.id, {
            include: [
                {model: User, as: 'user', attributes: ['firstName', 'lastName']},
                {model: User, as: 'team', attributes: ['firstName', 'lastName', 'username', 'profilePicture', 'email']},
            ],
        });

        res.json({success: true, workspace: updatedWorkspace});
    } catch (error) {
        res.status(500).json({error: error.message, success: false});
    }
};

export const deleteWorkspace = async (req, res) => {
    try {
        const workspace = await Workspace.findOne({
            where: {
                slug: req.params.slug,
            },
        });

        if (!workspace) {
            return res.status(404).json({error: 'Workspace not found', success: false});
        }

        // Only super admin (creator) can delete workspace
        if (workspace.userId !== req.user.id) {
            return res.status(403).json({error: 'Only the workspace creator can delete the workspace', success: false});
        }

        await workspace.destroy();
        res.json({success: true});
    } catch (error) {
        res.status(500).json({error: error.message, success: false});
    }
};

export const addNewWorkspace = async (req, res) => {
    try {
        const workspace = await createWorkspace({...req.body, userId: req.user.id});
        const populatedWorkspace = await Workspace.findByPk(workspace.id, {
            include: [
                {model: User, as: 'user', attributes: ['firstName', 'lastName']},
                {model: User, as: 'team', attributes: ['firstName', 'lastName', 'username', 'profilePicture', 'email']},
            ],
        });
        res.json({success: true, workspace: populatedWorkspace});
    } catch (error) {
        res.status(500).json({error: error.message, success: false});
    }
};

const checkIfSlugExists = async (slug) => {
    const count = await Workspace.count({where: {slug}});
    return count > 0;
};

export const createWorkspace = async (payload, usage = 'create') => {
    const {slug} = payload;
    const slugExists = await checkIfSlugExists(slug);
    if (slugExists && usage === 'create') {
        throw new Error('A workspace with this slug already exists');
    } else if (slugExists && usage === 'new-user') {
        let newSlug = Math.random().toString(36).substring(2, 10);
        while (await checkIfSlugExists(newSlug)) {
            newSlug = Math.random().toString(36).substring(2, 10);
        }
        payload.slug = newSlug;
    }

    const workspace = await Workspace.create(payload);
    return workspace;
};

/**
 * Add a user as an admin to a workspace
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const addAdmin = async (req, res) => {
    try {
        const {email} = req.body;
        const workspace = await Workspace.findOne({
            where: {slug: req.params.slug},
        });

        if (!workspace) {
            return res.status(404).json({error: 'Workspace not found', success: false});
        }

        // Only super admin (creator) can add admins
        if (workspace.userId !== req.user.id) {
            return res.status(403).json({error: 'Only the workspace creator can add admins', success: false});
        }

        const user = await User.findOne({where: {email}});
        if (!user) {
            return res.status(404).json({error: 'User not found', success: false});
        }

        // Check if user is already a team member
        const teamMember = await WorkspaceTeam.findOne({
            where: {
                workspaceId: workspace.id,
                userId: user.id,
            },
        });

        if (!teamMember) {
            return res.status(400).json({error: 'User is not a member of this workspace', success: false});
        }

        // Update the user's admin status
        await teamMember.update({isAdmin: true});

        res.json({success: true, message: 'Admin added successfully'});
    } catch (error) {
        res.status(500).json({error: error.message, success: false});
    }
};

/**
 * Remove a user's admin status from a workspace
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const removeAdmin = async (req, res) => {
    try {
        const {email} = req.body;
        const workspace = await Workspace.findOne({
            where: {slug: req.params.slug},
        });

        if (!workspace) {
            return res.status(404).json({error: 'Workspace not found', success: false});
        }

        // Only super admin (creator) can remove admins
        if (workspace.userId !== req.user.id) {
            return res.status(403).json({error: 'Only the workspace creator can remove admins', success: false});
        }

        const user = await User.findOne({where: {email}});
        if (!user) {
            return res.status(404).json({error: 'User not found', success: false});
        }

        // Cannot remove the creator's admin status
        if (user.id === workspace.userId) {
            return res.status(400).json({
                error: 'Cannot remove the workspace creator\'s admin status',
                success: false,
            });
        }

        // Check if user is already a team member
        const teamMember = await WorkspaceTeam.findOne({
            where: {
                workspaceId: workspace.id,
                userId: user.id,
            },
        });

        if (!teamMember) {
            return res.status(400).json({error: 'User is not a member of this workspace', success: false});
        }

        // Update the user's admin status
        await teamMember.update({isAdmin: false});

        res.json({success: true, message: 'Admin removed successfully'});
    } catch (error) {
        res.status(500).json({error: error.message, success: false});
    }
};

/**
 * Remove a user from a workspace
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const removeUser = async (req, res) => {
    try {
        const {email} = req.body;
        const workspace = await Workspace.findOne({
            where: {slug: req.params.slug},
        });

        if (!workspace) {
            return res.status(404).json({error: 'Workspace not found', success: false});
        }

        // Only super admin (creator) or admins can remove users
        if (workspace.userId !== req.user.id) {
            const isAdmin = await WorkspaceTeam.findOne({
                where: {
                    workspaceId: workspace.id,
                    userId: req.user.id,
                    isAdmin: true,
                },
            });

            if (!isAdmin) {
                return res.status(403).json({
                    error: 'You do not have permission to remove users from this workspace',
                    success: false,
                });
            }
        }

        const user = await User.findOne({where: {email}});
        if (!user) {
            return res.status(404).json({error: 'User not found', success: false});
        }

        // Cannot remove the creator
        if (user.id === workspace.userId) {
            return res.status(400).json({error: 'Cannot remove the workspace creator', success: false});
        }

        // Check if user is a team member
        const teamMember = await WorkspaceTeam.findOne({
            where: {
                workspaceId: workspace.id,
                userId: user.id,
            },
        });

        if (!teamMember) {
            return res.status(400).json({error: 'User is not a member of this workspace', success: false});
        }

        // Remove the user from the workspace
        await teamMember.destroy();

        res.json({success: true, message: 'User removed from workspace successfully'});
    } catch (error) {
        res.status(500).json({error: error.message, success: false});
    }
};
