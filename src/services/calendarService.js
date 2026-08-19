/**
 * Task selection for the personal calendar feed.
 */
import {Op} from 'sequelize';
import Task from '../models/Task.js';
import User from '../models/User.js';
import {Workspace} from '../models/Workspace.js';

/**
 * A user's tasks with a due date, across every workspace they belong to.
 *
 * Unlike `openTasksFor`, every status is included — a subscribed calendar is
 * a personal record, and a task should not vanish from it on completion.
 * @param {string} userId - The feed owner.
 * @return {Promise<Array<Object>>} Tasks with `workspace` attached.
 */
export const tasksForCalendarFeed = async (userId) => Task.findAll({
    where: {dueDate: {[Op.ne]: null}},
    include: [
        {
            model: User,
            as: 'assignees',
            attributes: ['id'],
            through: {attributes: []},
            where: {id: userId},
            required: true,
        },
        {model: Workspace, as: 'workspace', attributes: ['title', 'slug'], required: false},
    ],
    order: [['dueDate', 'ASC']],
});
