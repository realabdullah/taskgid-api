import Task from './models/Task.js';
import User from './models/User.js';
import {Workspace} from './models/Workspace.js';
import WorkspaceTeam from './models/WorkspaceTeam.js';
import {getUserRoleInWorkspace} from './utils/workspaceUtils.js';

// Helper for standardized error responses
const errorResponse = (res, status, message) => res.status(status).json({error: message, success: false});

// Status and Priority Enums (ensure these match your Task model definitions)
const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];
const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

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
 * Fetches and computes statistics for a given workspace.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getWorkspaceStatistics = async (req, res) => {
    const {id: workspaceId} = req.params;
    const userId = req.user.id;

    try {
        // 1. Authorization: Check if user is part of the workspace
        const role = await getUserRoleInWorkspace(userId, workspaceId);
        if (!role) {
            const workspaceExists = await Workspace.findByPk(workspaceId, {attributes: ['id']});
            const status = workspaceExists ? 403 : 404;
            const message = workspaceExists ? 'Access denied' : 'Workspace not found';
            return errorResponse(res, status, message);
        }

        // 2. Fetch all relevant tasks for the workspace
        const tasks = await Task.findAll({
            where: {workspaceId},
            attributes: ['id', 'status', 'priority', 'dueDate'],
            include: [
                {
                    model: User,
                    as: 'assignees',
                    attributes: ['id'], // Only need IDs for counting
                    through: {attributes: []}, // Don't need join table attributes
                },
            ],
        });

        const totalTasks = tasks.length;
        const now = new Date();

        // Initialize counters
        const statusCounts = TASK_STATUSES.reduce((acc, status) => ({...acc, [status.toLowerCase()]: {count: 0}}), {});
        const priorityCounts = TASK_PRIORITIES.reduce(
            (acc, priority) => ({...acc, [priority.toLowerCase()]: {count: 0}}),
            {},
        );
        let overdueCount = 0;
        const memberTaskCounts = {}; // { userId: { assigned: 0, completed: 0, inProgress: 0 } }

        // 3. Process Tasks for Stats
        for (const task of tasks) {
            // Status Breakdown
            const statusKey = task.status?.toLowerCase();
            if (statusCounts[statusKey]) {
                statusCounts[statusKey].count++;
            }

            // Priority Breakdown
            const priorityKey = task.priority?.toLowerCase();
            if (priorityCounts[priorityKey]) {
                priorityCounts[priorityKey].count++;
            }

            // Overdue Check
            if (task.dueDate && new Date(task.dueDate) < now && task.status !== 'DONE') {
                overdueCount++;
            }

            // Member Activity
            if (task.assignees && task.assignees.length > 0) {
                task.assignees.forEach((assignee) => {
                    if (!memberTaskCounts[assignee.id]) {
                        memberTaskCounts[assignee.id] = {assigned: 0, completed: 0, inProgress: 0};
                    }
                    memberTaskCounts[assignee.id].assigned++;
                    if (task.status === 'DONE') {
                        memberTaskCounts[assignee.id].completed++;
                    }
                    if (task.status === 'IN_PROGRESS') {
                        memberTaskCounts[assignee.id].inProgress++;
                    }
                });
            }
        }

        // 4. Calculate Percentages
        Object.keys(statusCounts).forEach((key) => {
            statusCounts[key].percentage = calculatePercentage(statusCounts[key].count, totalTasks);
        });
        Object.keys(priorityCounts).forEach((key) => {
            priorityCounts[key].percentage = calculatePercentage(priorityCounts[key].count, totalTasks);
        });
        const overduePercentage = calculatePercentage(overdueCount, totalTasks);

        // 5. Fetch Member Details and Combine with Counts
        const teamMembers = await WorkspaceTeam.findAll({
            where: {workspaceId},
            include: [{
                model: User,
                as: 'memberDetail',
                attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'], // Include necessary details
            }],
            attributes: ['userId'], // Only need userId from the join table itself
        });

        const memberActivity = teamMembers.map((tm) => {
            const userDetails = tm.memberDetail.toJSON();
            const counts = memberTaskCounts[userDetails.id] || {assigned: 0, completed: 0, inProgress: 0};
            return {
                userId: userDetails.id,
                username: userDetails.username,
                firstName: userDetails.firstName,
                lastName: userDetails.lastName,
                profilePicture: userDetails.profilePicture,
                tasksAssigned: counts.assigned,
                tasksCompleted: counts.completed,
                tasksInProgress: counts.inProgress,
            };
        });

        // 6. Construct Final Response
        const statistics = {
            workspaceId,
            totalTasks,
            statusBreakdown: statusCounts,
            priorityBreakdown: priorityCounts,
            overdueTasks: {
                count: overdueCount,
                percentage: overduePercentage,
            },
            memberActivity,
        };

        res.json({success: true, statistics});
    } catch (error) {
        console.error(`Error fetching statistics for workspace ${workspaceId}:`, error);
        return errorResponse(res, 500, 'Failed to fetch workspace statistics.');
    }
};
