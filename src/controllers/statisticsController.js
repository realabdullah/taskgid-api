import Task from '../models/Task.js';
import User from '../models/User.js';
import {Workspace} from '../models/Workspace.js';
import WorkspaceTeam from '../models/WorkspaceTeam.js';
import TaskActivity from '../models/TaskActivity.js';
import {getUserRoleInWorkspace} from '../utils/workspaceUtils.js';
import {errorResponse} from '../utils/responseUtils.js';
import {Op} from 'sequelize';
import sequelize from '../config/database.js';

const TASK_STATUSES = ['todo', 'in_progress', 'done'];
const TASK_PRIORITIES = ['low', 'medium', 'high'];

/**
 * @param {number} count - The numerator.
 * @param {number} total - The denominator.
 * @return {number} The percentage value (0-100), rounded to one decimal place, or 0 if total is 0.
 * Calculates percentage, handling division by zero.
 */
const calculatePercentage = (count, total) => {
    if (total === 0) {
        return 0;
    }
    return parseFloat(((count / total) * 100).toFixed(1));
};

/**
 * Get yesterday's date (start of day)
 * @return {Date} Yesterday's date at 00:00:00
 */
const getYesterdayStart = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    return yesterday;
};

/**
 * Get yesterday's date (end of day)
 * @return {Date} Yesterday's date at 23:59:59
 */
const getYesterdayEnd = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);
    return yesterday;
};

/**
 * Fetches and computes statistics for a given workspace.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getWorkspaceStatistics = async (req, res) => {
    // Use workspaceSlug from route params
    const {slug: workspaceSlug} = req.params;
    const userId = req.user.id;
    const now = new Date();
    const yesterdayStart = getYesterdayStart();
    const yesterdayEnd = getYesterdayEnd();

    try {
        const workspace = await Workspace.findOne({
            where: {slug: workspaceSlug},
            attributes: ['id'],
        });

        if (!workspace) {
            return errorResponse(res, 404, 'Workspace not found');
        }

        const workspaceId = workspace.id;

        const role = await getUserRoleInWorkspace(userId, workspaceId);
        if (!role) {
            return errorResponse(res, 403, 'Access denied');
        }

        const totalTasksResult = await Task.count({
            where: {workspaceId},
        });
        const totalTasks = totalTasksResult;

        const statusCountsResult = await Task.findAll({
            attributes: [
                'status',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
            ],
            where: {workspaceId},
            group: ['status'],
            raw: true,
        });

        const priorityCountsResult = await Task.findAll({
            attributes: [
                'priority',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
            ],
            where: {workspaceId},
            group: ['priority'],
            raw: true,
        });

        const priorityStatusCountsResult = await Task.findAll({
            attributes: [
                'priority',
                'status',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
            ],
            where: {workspaceId},
            group: ['priority', 'status'],
            raw: true,
        });

        const completedTasksCount = await Task.count({
            where: {
                workspaceId,
                status: 'done',
            },
        });

        const completedYesterdayCount = await Task.count({
            where: {
                workspaceId,
                status: 'done',
                updatedAt: {
                    [Op.between]: [yesterdayStart, yesterdayEnd],
                },
            },
        });

        const inProgressTasksCount = await Task.count({
            where: {
                workspaceId,
                status: 'in_progress',
            },
        });

        const overdueTasksCount = await Task.count({
            where: {
                workspaceId,
                status: {
                    [Op.ne]: 'done',
                },
                dueDate: {
                    [Op.lt]: now,
                },
            },
        });

        const newlyOverdueCount = await Task.count({
            where: {
                workspaceId,
                status: {
                    [Op.ne]: 'done',
                },
                dueDate: {
                    [Op.between]: [yesterdayStart, yesterdayEnd],
                },
            },
        });

        const statusChangesCount = await TaskActivity.count({
            where: {
                action: 'status_changed',
                createdAt: {
                    [Op.between]: [yesterdayStart, yesterdayEnd],
                },
                details: {
                    oldValue: 'in_progress',
                    newValue: 'done',
                },
            },
            include: [
                {
                    model: Task,
                    as: 'task',
                    attributes: [],
                    where: {workspaceId},
                    required: true,
                },
            ],
        });

        const statusCounts = TASK_STATUSES.reduce(
            (acc, status) => ({
                ...acc,
                [status]: {count: 0, percentage: 0},
            }),
            {},
        );

        statusCountsResult.forEach((result) => {
            const status = result.status?.toLowerCase();
            if (statusCounts[status]) {
                statusCounts[status].count = parseInt(result.count, 10);
                statusCounts[status].percentage = calculatePercentage(
                    statusCounts[status].count,
                    totalTasks,
                );
            }
        });

        const priorityCounts = {};
        TASK_PRIORITIES.forEach((priority) => {
            priorityCounts[priority] = {};
            TASK_STATUSES.forEach((status) => {
                priorityCounts[priority][status] = {count: 0, percentage: 0};
            });
            priorityCounts[priority].total = {count: 0, percentage: 0};
        });

        priorityCountsResult.forEach((result) => {
            const priority = result.priority?.toLowerCase();
            if (priorityCounts[priority]) {
                priorityCounts[priority].total.count = parseInt(result.count, 10);
                priorityCounts[priority].total.percentage = calculatePercentage(
                    priorityCounts[priority].total.count,
                    totalTasks,
                );
            }
        });

        priorityStatusCountsResult.forEach((result) => {
            const priority = result.priority?.toLowerCase();
            const status = result.status?.toLowerCase();
            if (priorityCounts[priority] && priorityCounts[priority][status]) {
                priorityCounts[priority][status].count = parseInt(result.count, 10);
                priorityCounts[priority][status].percentage = calculatePercentage(
                    priorityCounts[priority][status].count,
                    priorityCounts[priority].total.count,
                );
            }
        });

        const {page = 1, limit = 20} = req.query;
        const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

        const teamMembers = await WorkspaceTeam.findAll({
            where: {workspaceId},
            include: [
                {
                    model: User,
                    as: 'memberDetail',
                    attributes: [
                        'id',
                        'username',
                        'firstName',
                        'lastName',
                        'profilePicture',
                    ],
                },
            ],
            attributes: ['userId'],
            limit: parseInt(limit, 10),
            offset,
        });

        const memberIds = teamMembers.map((member) => member.memberDetail.id);

        const memberAssignedCounts = await sequelize.query(
            `SELECT ta.user_id, COUNT(t.id) as count 
             FROM tasks t 
             JOIN task_assignees ta ON t.id = ta.task_id 
             WHERE t.workspace_id = :workspaceId 
             AND ta.user_id IN (:memberIds) 
             GROUP BY ta.user_id`,
            {
                replacements: {workspaceId, memberIds},
                type: sequelize.QueryTypes.SELECT,
                raw: true,
            },
        );

        const memberCompletedCounts = await sequelize.query(
            `SELECT ta.user_id, COUNT(t.id) as count 
             FROM tasks t 
             JOIN task_assignees ta ON t.id = ta.task_id 
             WHERE t.workspace_id = :workspaceId 
             AND ta.user_id IN (:memberIds) 
             AND t.status = 'done' 
             GROUP BY ta.user_id`,
            {
                replacements: {workspaceId, memberIds},
                type: sequelize.QueryTypes.SELECT,
                raw: true,
            },
        );

        const assignedCountMap = {};
        memberAssignedCounts.forEach((item) => {
            assignedCountMap[item.user_id] = parseInt(item.count, 10);
        });

        const completedCountMap = {};
        memberCompletedCounts.forEach((item) => {
            completedCountMap[item.user_id] = parseInt(item.count, 10);
        });

        const memberActivity = teamMembers.map((member) => {
            const userId = member.memberDetail.id;
            const assigned = assignedCountMap[userId] || 0;
            const completed = completedCountMap[userId] || 0;

            return {
                assigned,
                completed,
                percentage: calculatePercentage(completed, assigned),
                user: {
                    id: userId,
                    username: member.memberDetail.username,
                    firstName: member.memberDetail.firstName,
                    lastName: member.memberDetail.lastName,
                    profilePicture: member.memberDetail.profilePicture,
                },
            };
        });

        // 16. Construct final statistics object
        const statistics = {
            totalTasks,
            completedTasks: {
                count: completedTasksCount,
                percentage: calculatePercentage(completedTasksCount, totalTasks),
                completedYesterday: completedYesterdayCount,
            },
            inProgressTasks: {
                count: inProgressTasksCount,
                percentage: calculatePercentage(inProgressTasksCount, totalTasks),
                movedToDoneYesterday: statusChangesCount,
            },
            overdueTasks: {
                count: overdueTasksCount,
                percentage: calculatePercentage(overdueTasksCount, totalTasks),
                newlyOverdueYesterday: newlyOverdueCount,
            },
            statusBreakdown: statusCounts,
            priorityBreakdown: priorityCounts,
            memberActivity,
            pagination: {
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                totalMembers: await WorkspaceTeam.count({where: {workspaceId}}),
            },
        };

        return res.json({success: true, statistics});
    } catch (error) {
        console.error(
            `Error fetching statistics for workspace slug ${workspaceSlug}:`,
            error,
        );
        return errorResponse(res, 500, 'Failed to fetch workspace statistics.');
    }
};
