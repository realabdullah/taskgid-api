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
import {errorResponse} from '../utils/responseUtils.js';
import {Op} from 'sequelize';
import Sequelize from '../config/database.js';
import WorkspaceActivity from '../models/WorkspaceActivity.js';
import Task from '../models/Task.js';
import TaskAssignee from '../models/TaskAssignee.js';

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

    try {
        const {workspace, error} = await findWorkspaceBySlugAndCheckAccess(
            slug,
            userId,
        );

        if (error) return errorResponse(res, error.status, error.message);

        const {count, rows: teamMemberships} = await WorkspaceTeam.findAndCountAll({
            where: {workspaceId: workspace.id},
            include: [
                {
                    model: User,
                    as: 'memberDetail',
                    attributes: [
                        'id', 'firstName', 'lastName', 'email', 'profilePicture',
                        'username', 'title', 'about', 'location', 'createdAt',
                    ],
                },
            ],
            limit,
            offset,
            order: [[{model: User, as: 'memberDetail'}, 'firstName', 'ASC']],
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
            where: {
                userId: {[Op.in]: memberIds},
            },
            include: [{
                model: Task,
                as: 'task',
                attributes: [],
                where: {
                    workspaceId: workspace.id,
                    status: 'done',
                },
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

        const team = teamMemberships.map((tm) => {
            const userId = tm.memberDetail.id;
            return {
                ...tm.memberDetail.toJSON(),
                role: tm.role,
                dateJoined: tm.createdAt,
                taskStats: {
                    assigned: assignedTasksMap.get(userId) || 0,
                    completed: completedTasksMap.get(userId) || 0,
                },
            };
        });

        res.json(createPaginatedResponse(team, count, page, limit));
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
