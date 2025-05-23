/* eslint-disable require-jsdoc */
import {Workspace} from '../models/Workspace.js';
import {logWorkspaceActivity} from '../utils/activityLogger.js';
import User from '../models/User.js';
import 'dotenv/config';
import WorkspaceTeam from '../models/WorkspaceTeam.js';
import {
    getPaginationParams,
    createPaginatedResponse,
} from '../utils/pagination.js';
import {getUserRoleInWorkspace} from '../utils/workspaceUtils.js';
import {errorResponse, successResponse} from '../utils/responseUtils.js';
import {Op} from 'sequelize';
import Sequelize from '../config/database.js';
import WorkspaceActivity from '../models/WorkspaceActivity.js';
import Task from '../models/Task.js';
import TaskAssignee from '../models/TaskAssignee.js';
import TaskActivity from '../models/TaskActivity.js';

/**
 * Find a workspace by slug and check if user has access
 * @param {string} slug - Workspace slug
 * @param {string} userId - User ID
 * @param {boolean} checkRole - Whether to check role (default: true)
 * @return {Object} Object containing workspace, role and error information
 */
async function findWorkspaceBySlugAndCheckAccess(
    slug,
    userId,
    checkRole = true,
) {
    const workspace = await Workspace.findOne({
        where: {slug},
        include: [{model: User, as: 'user', attributes: ['id']}],
    });

    if (!workspace) {
        return {
            workspace: null,
            role: null,
            error: {status: 404, message: 'Workspace not found'},
        };
    }

    let role = null;
    if (checkRole) {
        role = await getUserRoleInWorkspace(userId, workspace.id);
        if (!role) {
            return {
                workspace: null,
                role: null,
                error: {status: 403, message: 'Access denied'},
            };
        }
    }

    return {workspace, role, error: null};
}

/**
 * Get member counts for multiple workspaces
 * @param {Array<string>} workspaceIds - Array of workspace IDs
 * @return {Map} Map of workspace IDs to member counts
 * @throws {Error} If fetching member counts fails
 */
const getMemberCounts = async (workspaceIds) => {
    if (!workspaceIds || workspaceIds.length === 0) return new Map();

    try {
        const counts = await WorkspaceTeam.findAll({
            attributes: [
                'workspaceId',
                [Sequelize.fn('COUNT', Sequelize.col('user_id')), 'count'],
            ],
            where: {workspaceId: {[Op.in]: workspaceIds}},
            group: ['workspaceId'],
            raw: true,
        });
        return new Map(
            counts.map((item) => [item.workspaceId, parseInt(item.count, 10)]),
        );
    } catch (error) {
        throw new Error('Failed to fetch member counts');
    }
};

/**
 * Fetch workspaces created by a user with pagination
 * @param {string} userId - User ID
 * @param {Object} paginationParams - Pagination parameters
 * @param {number} paginationParams.limit - Number of items per page
 * @param {number} paginationParams.offset - Offset for pagination
 * @return {Object} Object with count and rows of workspaces
 */
const fetchCreatedWorkspaces = async (userId, {limit, offset}) => {
    const totalCount = await Workspace.count({where: {userId: userId}});
    if (totalCount === 0) return {count: 0, rows: []};

    const workspaces = await Workspace.findAll({
        where: {userId: userId},
        include: [
            {
                model: User,
                as: 'user',
                attributes: [
                    'id',
                    'firstName',
                    'lastName',
                    'email',
                    'username',
                    'profilePicture',
                ],
            },
        ],
        limit,
        offset,
        order: [['createdAt', 'DESC']],
    });

    const workspaceIds = workspaces.map((ws) => ws.id);
    const memberCountMap = await getMemberCounts(workspaceIds);

    const workspacesWithDetails = workspaces.map((ws) => {
        const wsData = ws.toJSON();
        return {
            ...wsData,
            userRole: 'creator',
            memberCount: memberCountMap.get(wsData.id) || 0,
        };
    });

    return {count: totalCount, rows: workspacesWithDetails};
};

/**
 * Fetch workspaces where user is invited with pagination
 * @param {string} userId - User ID
 * @param {Object} paginationParams - Pagination parameters
 * @param {number} paginationParams.limit - Number of items per page
 * @param {number} paginationParams.offset - Offset for pagination
 * @return {Object} Object with count and rows of workspaces
 */
const fetchInvitedWorkspaces = async (userId, {limit, offset}) => {
    const membershipWhereCondition = {
        userId: userId,
        role: {[Op.ne]: 'creator'},
    };

    const totalCount = await Workspace.count({
        include: [
            {
                model: WorkspaceTeam,
                as: 'teamMembership',
                attributes: [],
                where: membershipWhereCondition,
                required: true,
            },
        ],
    });
    if (totalCount === 0) return {count: 0, rows: []};

    const userMemberships = await WorkspaceTeam.findAll({
        attributes: ['workspaceId', 'role'],
        where: membershipWhereCondition,
        raw: true,
    });

    const roleMap = new Map(userMemberships.map((m) => [m.workspaceId, m.role]));
    const invitedWorkspaceIds = userMemberships.map((m) => m.workspaceId);

    const workspaces = await Workspace.findAll({
        where: {id: {[Op.in]: invitedWorkspaceIds}},
        include: [
            {
                model: User,
                as: 'user',
                attributes: [
                    'id',
                    'firstName',
                    'lastName',
                    'email',
                    'username',
                    'profilePicture',
                ],
            },
        ],
        limit,
        offset,
        order: [['createdAt', 'DESC']],
    });

    const currentPageWorkspaceIds = workspaces.map((ws) => ws.id);
    const memberCountMap = await getMemberCounts(currentPageWorkspaceIds);

    const workspacesWithDetails = workspaces.map((ws) => {
        const wsData = ws.toJSON();
        return {
            ...wsData,
            userRole: roleMap.get(wsData.id) || null,
            memberCount: memberCountMap.get(wsData.id) || 0,
        };
    });

    return {count: totalCount, rows: workspacesWithDetails};
};

/**
 * Fetch all workspaces where user is a member with pagination
 * @param {string} userId - User ID
 * @param {Object} paginationParams - Pagination parameters
 * @param {number} paginationParams.limit - Number of items per page
 * @param {number} paginationParams.offset - Offset for pagination
 * @return {Object} Object with count and rows of workspaces
 */
const fetchAllMemberWorkspaces = async (userId, {limit, offset}) => {
    const membershipWhereCondition = {userId: userId};

    const totalCount = await Workspace.count({
        include: [
            {
                model: WorkspaceTeam,
                as: 'teamMembership',
                attributes: [],
                where: membershipWhereCondition,
                required: true,
            },
        ],
    });

    if (totalCount === 0) return {count: 0, rows: []};

    const userMemberships = await WorkspaceTeam.findAll({
        attributes: ['workspaceId', 'role'],
        where: {userId: userId},
        raw: true,
    });

    const roleMap = new Map(userMemberships.map((m) => [m.workspaceId, m.role]));
    const userWorkspaceIds = userMemberships.map((m) => m.workspaceId);

    const workspaces = await Workspace.findAll({
        where: {id: {[Op.in]: userWorkspaceIds}},
        include: [
            {
                model: User,
                as: 'user',
                attributes: [
                    'id',
                    'firstName',
                    'lastName',
                    'email',
                    'username',
                    'profilePicture',
                ],
            },
        ],
        limit,
        offset,
        order: [['createdAt', 'DESC']],
    });

    const currentPageWorkspaceIds = workspaces.map((ws) => ws.id);
    const memberCountMap = await getMemberCounts(currentPageWorkspaceIds);

    const workspacesWithDetails = workspaces.map((ws) => {
        const wsData = ws.toJSON();
        return {
            ...wsData,
            userRole: roleMap.get(wsData.id) || null,
            memberCount: memberCountMap.get(wsData.id) || 0,
        };
    });

    return {count: totalCount, rows: workspacesWithDetails};
};

/**
 * Get workspaces for the authenticated user with filtering and pagination
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters
 * @param {string} [req.query.type='all'] - Filter type ('created', 'invited', or 'all')
 * @param {number} [req.query.page] - Page number for pagination
 * @param {number} [req.query.limit] - Number of items per page
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} Response with paginated workspaces or error
 */
export const getWorkspaces = async (req, res) => {
    const {page, limit, offset} = getPaginationParams(req.query);
    const userId = req.user?.id;
    const type = req.query.type || 'all';

    if (!userId) return errorResponse(res, 401, 'User not authenticated');

    let fetchFunction;
    let operationType = type;

    switch (type) {
    case 'created':
        fetchFunction = fetchCreatedWorkspaces;
        break;
    case 'invited':
        fetchFunction = fetchInvitedWorkspaces;
        break;
    case 'all':
        fetchFunction = fetchAllMemberWorkspaces;
        break;
    default:
        fetchFunction = fetchAllMemberWorkspaces;
        operationType = type;
        break;
    }

    try {
        const {count, rows} = await fetchFunction(userId, {limit, offset});

        res.json(createPaginatedResponse(rows, count, page, limit));
    } catch (error) {
        const message = error.message.startsWith('Failed to fetch') ?
            error.message :
            `Failed to fetch ${operationType} workspaces.`;
        return errorResponse(res, 500, message);
    }
};

/**
 * Get a single workspace by slug with user's role and member count
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.slug - Workspace slug
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} Response with workspace details or error
 */
export const getWorkspace = async (req, res) => {
    const {slug} = req.params;
    const userId = req.user.id;

    try {
        const {workspace, role, error} = await findWorkspaceBySlugAndCheckAccess(
            slug,
            userId,
        );

        if (error) {
            return errorResponse(res, error.status, error.message);
        }

        const memberCount = await WorkspaceTeam.count({
            where: {workspaceId: workspace.id},
        });

        const detailedWorkspace = await Workspace.findByPk(workspace.id, {
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: [
                        'id',
                        'firstName',
                        'lastName',
                        'email',
                        'profilePicture',
                    ],
                },
            ],
        });

        const workspaceDetails = {
            ...detailedWorkspace.toJSON(),
            userRole: role,
            memberCount: memberCount,
        };

        res.json(workspaceDetails);
    } catch (err) {
        return errorResponse(res, 500, 'Failed to fetch workspace');
    }
};

/**
 * Get team members of a workspace with pagination
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.slug - Workspace slug
 * @param {Object} req.query - Query parameters for pagination
 * @param {number} [req.query.page] - Page number for pagination
 * @param {number} [req.query.limit] - Number of items per page
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} Response with paginated team members or error
 */
export const getWorkspaceTeam = async (req, res) => {
    const {page, limit, offset} = getPaginationParams(req.query);
    const {slug} = req.params;
    const userId = req.user.id;

    try {
        const {workspace, error} = await findWorkspaceBySlugAndCheckAccess(
            slug,
            userId,
        );

        if (error) {
            return errorResponse(res, error.status, error.message);
        }

        const {count, rows: teamMemberships} =
            await WorkspaceTeam.findAndCountAll({
                where: {workspaceId: workspace.id},
                include: [
                    {
                        model: User,
                        as: 'memberDetail',
                        attributes: [
                            'id',
                            'firstName',
                            'lastName',
                            'email',
                            'profilePicture',
                            'username',
                        ],
                    },
                ],
                limit,
                offset,
                order: [[{model: User, as: 'memberDetail'}, 'firstName', 'ASC']],
                distinct: true,
            });

        const team = teamMemberships.map((tm) => ({
            ...tm.memberDetail.toJSON(),
            role: tm.role,
        }));

        res.json(createPaginatedResponse(team, count, page, limit));
    } catch (err) {
        return errorResponse(res, 500, 'Failed to fetch workspace team');
    }
};

export const updateWorkspace = async (req, res) => {
    const {slug} = req.params;
    const userId = req.user.id;
    const payload = req.body;

    try {
        const workspace = await Workspace.findOne({where: {slug}});
        if (!workspace) return errorResponse(res, 404, 'Workspace not found');

        if (workspace.userId !== userId) {
            return errorResponse(res, 403, 'Only the workspace creator can update workspace details');
        }

        if (payload.slug && payload.slug !== workspace.slug) {
            const slugExists = await Workspace.count({
                where: {slug: payload.slug},
            });
            if (slugExists > 0) {
                return errorResponse(res, 400, 'A workspace with this slug already exists');
            }
        }

        const previousValues = workspace.toJSON();
        await workspace.update(payload);

        const updatedWorkspace = await Workspace.findByPk(workspace.id, {
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'firstName', 'lastName', 'email', 'profilePicture'],
                },
            ],
        });

        const changedFields = {};
        for (const key in payload) {
            if (payload[key] !== previousValues[key]) {
                changedFields[key] = {from: previousValues[key], to: payload[key]};
            }
        }

        await logWorkspaceActivity(
            updatedWorkspace.id,
            req.user.id,
            'workspace_updated',
            {workspaceName: updatedWorkspace.title, changes: changedFields},
        );

        res.json({success: true, workspace: updatedWorkspace});
    } catch (err) {
        return errorResponse(res, 500, err.message || 'Failed to update workspace');
    }
};

export const deleteWorkspace = async (req, res) => {
    const {slug} = req.params;
    const userId = req.user.id;

    try {
        const workspace = await Workspace.findOne({where: {slug}});
        if (!workspace) return errorResponse(res, 404, 'Workspace not found');

        if (workspace.userId !== userId) {
            return errorResponse(res, 403, 'Only the workspace creator can delete the workspace');
        }

        const meta = {workspaceName: workspace.title, workspaceSlug: workspace.slug};

        await workspace.destroy();
        await logWorkspaceActivity(workspace.id, req.user.id, 'workspace_deleted', meta);
        res.json({success: true, message: 'Workspace deleted successfully'});
    } catch (err) {
        return errorResponse(res, 500, 'Failed to delete workspace');
    }
};

export const addNewWorkspace = async (req, res) => {
    try {
        const payload = {...req.body, userId: req.user.id};

        if (payload.slug) {
            const slugExists = await Workspace.count({
                where: {slug: payload.slug},
            });
            if (slugExists > 0) {
                return errorResponse(
                    res,
                    400,
                    'A workspace with this slug already exists',
                );
            }
        } else {
            payload.slug = payload.title
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, '');
            let uniqueSlug = payload.slug;
            let counter = 1;
            while ((await Workspace.count({where: {slug: uniqueSlug}})) > 0) {
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

        await logWorkspaceActivity(
            workspace.id,
            req.user.id,
            'workspace_created',
            {workspaceName: workspace.title},
        );

        const populatedWorkspace = await Workspace.findByPk(workspace.id, {
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: [
                        'id',
                        'firstName',
                        'lastName',
                        'email',
                        'profilePicture',
                    ],
                },
            ],
        });

        res.status(201).json({success: true, workspace: populatedWorkspace});
    } catch (error) {
        return errorResponse(
            res,
            500,
            error.message || 'Failed to create workspace',
        );
    }
};

export const addTeamMember = async (req, res) => {
    const {slug} = req.params;
    const requestorId = req.user.id;
    const {email} = req.body;

    try {
        const workspace = await Workspace.findOne({
            where: {slug},
            attributes: ['id'],
        });
        if (!workspace) {
            return errorResponse(res, 404, 'Workspace not found');
        }
        const workspaceId = workspace.id;

        const requestorRole = await getUserRoleInWorkspace(
            requestorId,
            workspaceId,
        );
        if (!requestorRole || !['creator', 'admin'].includes(requestorRole)) {
            return errorResponse(
                res,
                403,
                'Only workspace admins or the creator can add members',
            );
        }

        const userToAdd = await User.findOne({where: {email}});
        if (!userToAdd) {
            return errorResponse(res, 404, 'User to add not found');
        }

        const existingRole = await getUserRoleInWorkspace(
            userToAdd.id,
            workspaceId,
        );
        if (existingRole) {
            return errorResponse(
                res,
                400,
                'User is already a member of this workspace',
            );
        }

        await WorkspaceTeam.create({
            workspaceId,
            userId: userToAdd.id,
            role: 'member',
        });

        res
            .status(201)
            .json({success: true, message: 'Team member added successfully'});
    } catch (err) {
        return errorResponse(res, 500, 'Failed to add team member');
    }
};

export const removeTeamMember = async (req, res) => {
    const {slug, userIdToRemove} = req.params;
    const requestorId = req.user.id;

    try {
        const workspace = await Workspace.findOne({
            where: {slug},
            attributes: ['id', 'userId'],
        });
        if (!workspace) return errorResponse(res, 404, 'Workspace not found');
        const workspaceId = workspace.id;

        const requestorRole = await getUserRoleInWorkspace(
            requestorId,
            workspaceId,
        );
        const targetRole = await getUserRoleInWorkspace(
            userIdToRemove,
            workspaceId,
        );

        if (!targetRole) {
            return errorResponse(res, 404, 'Team member not found in this workspace');
        }

        if (!requestorRole || !['creator', 'admin'].includes(requestorRole)) {
            return errorResponse(
                res,
                403,
                'Only workspace admins or the creator can remove members',
            );
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
    } catch (err) {
        return errorResponse(res, 500, 'Failed to remove team member');
    }
};

export const promoteToAdmin = async (req, res) => {
    const {slug, userId: targetUserId} = req.params;
    const requestorId = req.user.id;

    try {
        const workspace = await Workspace.findOne({
            where: {slug},
            attributes: ['id', 'userId'],
        });
        if (!workspace) return errorResponse(res, 404, 'Workspace not found');
        const workspaceId = workspace.id;

        if (workspace.userId !== requestorId) {
            return errorResponse(
                res,
                403,
                'Only the workspace creator can manage admin roles',
            );
        }

        const teamMember = await WorkspaceTeam.findOne({
            where: {workspaceId, userId: targetUserId},
        });
        if (!teamMember) {
            return errorResponse(res, 404, 'User is not a member of this workspace');
        }
        if (teamMember.role === 'creator') {
            return errorResponse(res, 400, 'Cannot change the creator\'s role');
        }
        if (teamMember.role === 'admin') {
            return errorResponse(res, 400, 'User is already an admin');
        }

        await teamMember.update({role: 'admin'});
        await logWorkspaceActivity(
            workspaceId,
            requestorId,
            'member_promoted',
            {
                promotedUser: `${teamMember.firstName} ${teamMember.lastName}`,
                previousRole: teamMember.role,
                newRole: 'admin',
            },
        );

        res.json({
            success: true,
            message: 'Member promoted to admin successfully',
        });
    } catch (err) {
        return errorResponse(res, 500, 'Failed to promote member to admin');
    }
};

export const demoteFromAdmin = async (req, res) => {
    const {slug, userId: targetUserId} = req.params;
    const requestorId = req.user.id;

    try {
        const workspace = await Workspace.findOne({
            where: {slug},
            attributes: ['id', 'userId'],
        });
        if (!workspace) return errorResponse(res, 404, 'Workspace not found');
        const workspaceId = workspace.id;

        if (workspace.userId !== requestorId) {
            return errorResponse(
                res,
                403,
                'Only the workspace creator can manage admin roles',
            );
        }

        if (targetUserId === workspace.userId) {
            return errorResponse(
                res,
                400,
                'Cannot change the workspace creator\'s role',
            );
        }

        const teamMember = await WorkspaceTeam.findOne({
            where: {workspaceId, userId: targetUserId},
        });
        if (!teamMember) {
            return errorResponse(res, 404, 'User is not a member of this workspace');
        }
        if (teamMember.role !== 'admin') {
            return errorResponse(res, 400, 'User is not currently an admin');
        }

        await teamMember.update({role: 'member'});
        await logWorkspaceActivity(
            workspaceId,
            requestorId,
            'member_demoted',
            {
                demotedUser: `${teamMember.firstName} ${teamMember.lastName}`,
                previousRole: 'admin',
                newRole: 'member',
            },
        );

        res.json({
            success: true,
            message: 'Admin demoted to member successfully',
        });
    } catch (err) {
        return errorResponse(res, 500, 'Failed to demote admin to member');
    }
};

export const getWorkspaceActivities = async (req, res) => {
    try {
        const {slug} = req.params;
        const {page, limit, offset} = getPaginationParams(req.query);

        const workspace = await Workspace.findOne({
            where: {slug},
            attributes: ['id'],
        });

        if (!workspace) return errorResponse(res, 404, 'Workspace not found');

        const role = await getUserRoleInWorkspace(req.user.id, workspace.id);
        if (!role) return errorResponse(res, 403, 'Access denied');

        const {count, rows: activities} = await WorkspaceActivity.findAndCountAll({
            where: {workspaceId: workspace.id},
            include: [{
                model: User,
                as: 'user',
                attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
            }],
            limit,
            offset,
            order: [['createdAt', 'DESC']],
        });

        const response = createPaginatedResponse(activities, count, page, limit);
        res.json(response);
    } catch (error) {
        console.error('Get Workspace Activities Error:', error);
        const statusCode = error.status || 500;
        return errorResponse(res, statusCode, error.message || 'Failed to fetch workspace activities');
    }
};

export const getComprehensiveTeamMembers = async (req, res) => {
    const {slug} = req.params;
    const {page, limit, offset} = getPaginationParams(req.query);
    const userId = req.user.id;
    const {
        search,
        role,
        sortBy = 'firstName',
        sortOrder = 'ASC',
        minTasksAssigned,
        maxTasksAssigned,
        minTasksCompleted,
        maxTasksCompleted,
    } = req.query;

    try {
        const {workspace, error} = await findWorkspaceBySlugAndCheckAccess(
            slug,
            userId,
        );

        if (error) return errorResponse(res, error.status, error.message);

        const memberWhereConditions = {workspaceId: workspace.id};
        if (role) memberWhereConditions.role = role;


        const userWhereConditions = {};
        if (search) {
            userWhereConditions[Op.or] = [
                {firstName: {[Op.like]: `%${search}%`}},
                {lastName: {[Op.like]: `%${search}%`}},
                {email: {[Op.like]: `%${search}%`}},
                {username: {[Op.like]: `%${search}%`}},
                {title: {[Op.like]: `%${search}%`}},
                {location: {[Op.like]: `%${search}%`}},
            ];
        }

        const validSortFields = ['firstName', 'lastName', 'email', 'username', 'title', 'location', 'createdAt'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'firstName';
        const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

        const {rows: teamMemberships} = await WorkspaceTeam.findAndCountAll({
            where: memberWhereConditions,
            include: [
                {
                    model: User,
                    as: 'memberDetail',
                    attributes: [
                        'id', 'firstName', 'lastName', 'email', 'profilePicture',
                        'username', 'title', 'about', 'location', 'createdAt',
                    ],
                    where: userWhereConditions,
                },
            ],
            limit,
            offset,
            order: [[{model: User, as: 'memberDetail'}, sortField, order]],
            distinct: true,
        });

        const memberIds = teamMemberships.map((tm) => tm.memberDetail.id);
        const tasksAssignedCount = await TaskAssignee.findAll({
            attributes: [
                'userId',
                [Sequelize.fn('COUNT', Sequelize.col('task_id')), 'totalAssigned'],
            ],
            where: {
                userId: {[Op.in]: memberIds},
            },
            include: [{
                model: Task,
                as: 'task',
                attributes: [],
                where: {workspaceId: workspace.id},
                required: true,
            }],
            group: ['userId'],
            raw: true,
        });

        const tasksCompletedCount = await TaskAssignee.findAll({
            attributes: [
                'userId',
                [Sequelize.fn('COUNT', Sequelize.col('task_id')), 'totalCompleted'],
            ],
            where: {userId: {[Op.in]: memberIds}},
            include: [{
                model: Task,
                as: 'task',
                attributes: [],
                where: {workspaceId: workspace.id, status: 'done'},
                required: true,
            }],
            group: ['userId'],
            raw: true,
        });

        const assignedTasksMap = new Map(
            tasksAssignedCount.map((item) => [item.userId, parseInt(item.totalAssigned, 10)]),
        );

        const completedTasksMap = new Map(
            tasksCompletedCount.map((item) => [item.userId, parseInt(item.totalCompleted, 10)]),
        );

        let team = teamMemberships.map((tm) => {
            const userId = tm.memberDetail.id;
            const assigned = assignedTasksMap.get(userId) || 0;
            const completed = completedTasksMap.get(userId) || 0;

            return {
                ...tm.memberDetail.toJSON(),
                role: tm.role,
                dateJoined: tm.createdAt,
                taskStats: {assigned, completed},
            };
        });

        if (minTasksAssigned !== undefined) {
            team = team.filter((member) => member.taskStats.assigned >= parseInt(minTasksAssigned, 10));
        }
        if (maxTasksAssigned !== undefined) {
            team = team.filter((member) => member.taskStats.assigned <= parseInt(maxTasksAssigned, 10));
        }
        if (minTasksCompleted !== undefined) {
            team = team.filter((member) => member.taskStats.completed >= parseInt(minTasksCompleted, 10));
        }
        if (maxTasksCompleted !== undefined) {
            team = team.filter((member) => member.taskStats.completed <= parseInt(maxTasksCompleted, 10));
        }

        let totalCount;
        if (minTasksAssigned !== undefined || maxTasksAssigned !== undefined ||
            minTasksCompleted !== undefined || maxTasksCompleted !== undefined) {
            totalCount = team.length;
        } else {
            totalCount = await WorkspaceTeam.count({
                where: memberWhereConditions,
                include: [
                    {model: User, as: 'memberDetail', where: userWhereConditions},
                ],
                distinct: true,
            });
        }

        res.json(createPaginatedResponse(team, totalCount, page, limit));
    } catch (err) {
        console.error('Error fetching comprehensive team data:', err);
        return errorResponse(res, 500, 'Failed to fetch comprehensive team data');
    }
};

export const getUserTasks = async (req, res) => {
    const {slug, memberId} = req.params;
    const {page, limit, offset} = getPaginationParams(req.query);
    const userId = req.user.id;

    try {
        const {workspace, error} = await findWorkspaceBySlugAndCheckAccess(
            slug,
            userId,
        );

        if (error) return errorResponse(res, error.status, error.message);

        const isMember = await WorkspaceTeam.findOne({
            where: {workspaceId: workspace.id, userId: memberId},
        });
        if (!isMember) return errorResponse(res, 404, 'User is not a member of this workspace');

        const {count, rows: tasks} = await Task.findAndCountAll({
            attributes: ['id', 'title', 'dueDate', 'priority', 'status'],
            where: {
                workspaceId: workspace.id,
            },
            include: [{
                model: User,
                as: 'assignees',
                attributes: [],
                where: {id: memberId},
                through: {attributes: []},
                required: true,
            }],
            limit,
            offset,
            order: [['dueDate', 'ASC'], ['priority', 'DESC']],
            distinct: true,
        });

        res.json(createPaginatedResponse(tasks, count, page, limit));
    } catch (err) {
        console.error('Error fetching user tasks:', err);
        return errorResponse(res, 500, 'Failed to fetch user tasks');
    }
};

export const getUserWorkspaceActivities = async (req, res) => {
    const {slug, memberId} = req.params;
    const {page, limit, offset} = getPaginationParams(req.query);
    const userId = req.user.id;

    try {
        const {workspace, error} = await findWorkspaceBySlugAndCheckAccess(
            slug,
            userId,
        );

        if (error) return errorResponse(res, error.status, error.message);

        const isMember = await WorkspaceTeam.findOne({
            where: {workspaceId: workspace.id, userId: memberId},
        });

        if (!isMember) return errorResponse(res, 404, 'User is not a member of this workspace');

        const {count, rows: activities} = await WorkspaceActivity.findAndCountAll({
            where: {
                workspaceId: workspace.id,
                userId: memberId,
            },
            include: [{
                model: User,
                as: 'user',
                attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
            }],
            limit,
            offset,
            order: [['createdAt', 'DESC']],
        });

        const response = createPaginatedResponse(activities, count, page, limit);
        res.json(response);
    } catch (err) {
        console.error('Error fetching user activities:', err);
        return errorResponse(res, 500, 'Failed to fetch user activities');
    }
};

export const getTeamStatistics = async (req, res) => {
    const {slug} = req.params;
    const userId = req.user.id;
    const timePeriod = req.query.period || 'month';

    try {
        const {workspace, error} = await findWorkspaceBySlugAndCheckAccess(slug, userId);
        if (error) return errorResponse(res, error.status, error.message);

        const now = new Date();
        let startDate;

        switch (timePeriod) {
        case 'week':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - now.getDay());
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'quarter':
            const quarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), quarter * 3, 1);
            break;
        case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
        default:
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        const teamMembers = await WorkspaceTeam.findAll({
            where: {workspaceId: workspace.id},
            include: [{
                model: User,
                as: 'memberDetail',
                attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
            }],
        });

        const memberIds = teamMembers.map((member) => member.userId);

        const allTasks = await Task.findAll({
            where: {
                workspaceId: workspace.id,
                createdAt: {[Op.gte]: startDate},
            },
            include: [{
                model: User,
                as: 'assignees',
                attributes: ['id'],
                through: {attributes: []},
            }],
        });

        const tasksWithDueDate = allTasks.filter((task) =>
            task.dueDate && new Date(task.dueDate) >= startDate && new Date(task.dueDate) <= now,
        );

        const totalTasks = allTasks.length;
        const completedTasks = allTasks.filter((task) => task.status === 'done').length;
        const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

        let onTimeDeliveries = 0;
        const totalTasksWithDueDate = tasksWithDueDate.length;

        for (const task of tasksWithDueDate) {
            if (task.status === 'done') {
                const statusChangeActivity = await TaskActivity.findOne({
                    where: {
                        'taskId': task.id,
                        'action': 'status_changed',
                        'details.changeDetails.to': 'done',
                    },
                    order: [['createdAt', 'DESC']],
                });

                if (statusChangeActivity && new Date(statusChangeActivity.createdAt) <= new Date(task.dueDate)) {
                    onTimeDeliveries++;
                }
            }
        }

        const onTimeDeliveryRate = totalTasksWithDueDate > 0 ? (onTimeDeliveries / totalTasksWithDueDate) * 100 : 0;

        const memberTaskAssignments = new Map();

        for (const task of allTasks) {
            for (const assignee of task.assignees) {
                const assigneeId = assignee.id;
                memberTaskAssignments.set(assigneeId, (memberTaskAssignments.get(assigneeId) || 0) + 1);
            }
        }

        const activeMembers = memberTaskAssignments.size;
        const teamUtilizationRate = memberIds.length > 0 ? (activeMembers / memberIds.length) * 100 : 0;

        const memberStats = [];

        for (const member of teamMembers) {
            const memberId = member.userId;

            const memberTasks = allTasks.filter((task) =>
                task.assignees.some((assignee) => assignee.id === memberId),
            );

            const memberTasksCount = memberTasks.length;
            const memberCompletedTasksCount = memberTasks.filter((task) => task.status === 'done').length;
            const memberCompletionRate = memberTasksCount > 0 ?
                (memberCompletedTasksCount / memberTasksCount) * 100 : 0;

            let memberOnTimeDeliveries = 0;
            const memberTasksWithDueDate = memberTasks.filter((task) =>
                task.dueDate && new Date(task.dueDate) >= startDate && new Date(task.dueDate) <= now,
            );

            for (const task of memberTasksWithDueDate) {
                if (task.status === 'done') {
                    const statusChangeActivity = await TaskActivity.findOne({
                        where: {
                            'taskId': task.id,
                            'action': 'status_changed',
                            'details.changeDetails.to': 'done',
                        },
                        order: [['createdAt', 'DESC']],
                    });

                    if (statusChangeActivity && new Date(statusChangeActivity.createdAt) <= new Date(task.dueDate)) {
                        memberOnTimeDeliveries++;
                    }
                }
            }

            const memberOnTimeRate = memberTasksWithDueDate.length > 0 ?
                (memberOnTimeDeliveries / memberTasksWithDueDate.length) * 100 : 0;

            let totalCompletionTimeHours = 0;
            let tasksWithCompletionTime = 0;

            for (const task of memberTasks.filter((t) => t.status === 'done')) {
                const statusChangeActivity = await TaskActivity.findOne({
                    where: {
                        'taskId': task.id,
                        'action': 'status_changed',
                        'details.changeDetails.to': 'done',
                    },
                    order: [['createdAt', 'DESC']],
                });

                if (statusChangeActivity) {
                    const creationTime = new Date(task.createdAt);
                    const completionTime = new Date(statusChangeActivity.createdAt);
                    const completionTimeHours = (completionTime - creationTime) / (1000 * 60 * 60);

                    totalCompletionTimeHours += completionTimeHours;
                    tasksWithCompletionTime++;
                }
            }

            const avgCompletionTimeHours = tasksWithCompletionTime > 0 ?
                totalCompletionTimeHours / tasksWithCompletionTime : 0;

            memberStats.push({
                member: {
                    id: memberId,
                    username: member.memberDetail.username,
                    firstName: member.memberDetail.firstName,
                    lastName: member.memberDetail.lastName,
                    profilePicture: member.memberDetail.profilePicture,
                },
                taskCount: memberTasksCount,
                completedTaskCount: memberCompletedTasksCount,
                completionRate: memberCompletionRate,
                onTimeDeliveryRate: memberOnTimeRate,
                avgCompletionTimeHours,
            });
        }

        // Sort by completion rate to get top performers
        memberStats.sort((a, b) => b.completionRate - a.completionRate);
        const topPerformers = memberStats.slice(0, 3);

        // Calculate average task completion time for the team
        const avgTeamCompletionTimeHours = memberStats.reduce(
            (sum, stats) => sum + stats.avgCompletionTimeHours, 0,
        ) / (memberStats.length || 1);

        // Calculate task distribution (how evenly tasks are distributed)
        const taskAssignmentCounts = Array.from(memberTaskAssignments.values());
        const avgTasksPerMember = taskAssignmentCounts.length > 0 ?
            taskAssignmentCounts.reduce((sum, count) => sum + count, 0) / taskAssignmentCounts.length : 0;

        // Calculate standard deviation to determine task distribution evenness
        const taskCountVariance = taskAssignmentCounts.length > 0 ?
            taskAssignmentCounts.reduce((sum, count) => sum + Math.pow(count - avgTasksPerMember, 2), 0) /
            taskAssignmentCounts.length : 0;
        const taskDistributionStdDev = Math.sqrt(taskCountVariance);

        // Task distribution evenness as a percentage (lower std dev means more even distribution)
        // Using a formula to convert std dev to a 0-100 scale where 100 is perfectly even
        const taskDistributionEvenness = avgTasksPerMember > 0 ?
            Math.max(0, 100 - (taskDistributionStdDev / avgTasksPerMember) * 100) : 100;

        // Calculate average priority level of tasks
        const priorityMap = {low: 1, medium: 2, high: 3};
        const prioritySum = allTasks.reduce((sum, task) => sum + (priorityMap[task.priority] || 0), 0);
        const avgPriorityLevel = totalTasks > 0 ? prioritySum / totalTasks : 0;

        const data = {
            timePeriod,
            periodStart: startDate,
            periodEnd: now,
            overallStats: {
                totalTasks,
                completedTasks,
                completionRate: parseFloat(completionRate.toFixed(2)),
                onTimeDeliveryRate: parseFloat(onTimeDeliveryRate.toFixed(2)),
                teamUtilizationRate: parseFloat(teamUtilizationRate.toFixed(2)),
                avgCompletionTimeHours: parseFloat(avgTeamCompletionTimeHours.toFixed(2)),
                taskDistributionEvenness: parseFloat(taskDistributionEvenness.toFixed(2)),
                avgPriorityLevel: parseFloat(avgPriorityLevel.toFixed(2)),
            },
            topPerformers: topPerformers.map((performer) => ({
                ...performer,
                completionRate: parseFloat(performer.completionRate.toFixed(2)),
                onTimeDeliveryRate: parseFloat(performer.onTimeDeliveryRate.toFixed(2)),
                avgCompletionTimeHours: parseFloat(performer.avgCompletionTimeHours.toFixed(2)),
            })),
            memberStats: memberStats.map((stat) => ({
                ...stat,
                completionRate: parseFloat(stat.completionRate.toFixed(2)),
                onTimeDeliveryRate: parseFloat(stat.onTimeDeliveryRate.toFixed(2)),
                avgCompletionTimeHours: parseFloat(stat.avgCompletionTimeHours.toFixed(2)),
            })),
        };

        return successResponse(res, {data});
    } catch (err) {
        console.error('Error fetching team statistics:', err);
        return errorResponse(res, 500, 'Failed to fetch team statistics');
    }
};
