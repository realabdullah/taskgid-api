import {AsyncLocalStorage} from 'async_hooks';
import WorkspaceActivity from '../models/WorkspaceActivity.js';
import TaskActivity from '../models/TaskActivity.js';

/** Carries the actor kind for nested activity writes without threading it through every call. */
const activitySourceStore = new AsyncLocalStorage();

/**
 * Runs `fn` so every `logTaskActivity` call inside records `source: 'agent'`.
 * @param {Function} fn - Async work whose task activities should be tagged as agent.
 * @return {Promise<*>} Whatever `fn` resolves to.
 */
export const runAsAgent = (fn) => activitySourceStore.run('agent', fn);

/**
 * Log an activity in a workspace
 * @param {string} workspaceId - The ID of the workspace
 * @param {string} userId - The ID of the user performing the action
 * @param {string} action - The type of action performed
 * @param {Object} details - Additional details about the action
 * @return {Promise<WorkspaceActivity>} The created activity record
 */
export const logWorkspaceActivity = async (workspaceId, userId, action, details = {}) => {
    try {
        return await WorkspaceActivity.create({
            workspaceId,
            userId,
            action,
            details,
        });
    } catch (error) {
        console.error('Error logging workspace activity:', error);
        return null;
    }
};

/**
 * Log an activity for a task
 * @param {string} taskId - The ID of the task
 * @param {string} userId - The ID of the user performing the action
 * @param {string} action - The type of action performed
 * @param {Object} details - Additional details about the action
 * @return {Promise<TaskActivity>} The created activity record
 */
export const logTaskActivity = async (taskId, userId, action, details = {}) => {
    try {
        const source = activitySourceStore.getStore() === 'agent' ? 'agent' : 'user';
        return await TaskActivity.create({
            taskId,
            userId,
            action,
            source,
            details,
        });
    } catch (error) {
        console.error('Error logging task activity:', error);
        return null;
    }
};
