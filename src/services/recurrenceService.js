import pkg from 'rrule';
import {Op} from 'sequelize';
import sequelize from '../config/database.js';
import Task from '../models/Task.js';
import TaskAssignee from '../models/TaskAssignee.js';
import TaskRecurrence from '../models/TaskRecurrence.js';
import TaskTag from '../models/TaskTag.js';
import {normaliseChecklist} from '../utils/checklist.js';
import {logTaskActivity, logWorkspaceActivity} from '../utils/activityLogger.js';

// `rrule` ships CommonJS, and this package is an ES module, so the named
// exports are not reachable directly.
const {rrulestr} = pkg;

// Per rule, per run. Hitting the cap is not data loss — `lastSpawnedAt`
// advances only to the last task created, so the next run continues.
export const MAX_SPAWNS_PER_RUN = 50;

/**
 * Parse a stored rule, rejecting anything RRULE cannot express.
 * @param {string} rule - An RFC 5545 string, including its DTSTART.
 * @return {Object} The parsed rule.
 */
export const parseRule = (rule) => rrulestr(rule);

/**
 * Whether a string is a rule this service can act on.
 * @param {string} rule - Candidate RFC 5545 string.
 * @return {string|null} An error message, or null when the rule is usable.
 */
export const validateRule = (rule) => {
    if (typeof rule !== 'string' || !rule.trim()) return 'A recurrence rule is required';
    if (!/DTSTART[:;]/i.test(rule)) {
        // Without one, rrule takes the time-of-day from the moment of parsing,
        // so the same rule would produce different times on every run.
        return 'A recurrence rule must include an explicit DTSTART';
    }

    let parsed;
    try {
        parsed = rrulestr(rule);
    } catch (error) {
        return `Invalid recurrence rule: ${error.message}`;
    }

    // A rule that never fires is a rule someone will wait on forever.
    const horizon = new Date(Date.now() + 366 * 24 * 60 * 60 * 1000);
    if (!parsed.after(new Date(0), true) && !parsed.before(horizon, true)) {
        return 'That recurrence rule never produces an occurrence';
    }

    return null;
};

/**
 * The occurrences of a rule that are due and not yet turned into tasks.
 * @param {Object} recurrence - A TaskRecurrence instance.
 * @param {Date} now - The instant the run is for.
 * @return {Array<Date>} Occurrence dates, oldest first, capped per run.
 */
export const dueOccurrences = (recurrence, now) => {
    const rule = parseRule(recurrence.rrule);

    /*
     * The window opens strictly after the last occurrence already spawned, so a
     * run repeated by a retry or a second cron host claims nothing twice. A rule
     * that has never spawned starts from its own DTSTART rather than from the
     * moment it was created, which is what makes a rule backdated on purpose
     * behave as the author asked.
     */
    const after = recurrence.lastSpawnedAt ? new Date(recurrence.lastSpawnedAt) : new Date(0);
    const occurrences = rule.between(after, now, true).filter((date) => date > after);

    return occurrences.slice(0, MAX_SPAWNS_PER_RUN);
};

/**
 * Create one task for one occurrence of a rule.
 *
 * Instances inherit the rule's fields and its checklist with every item reset;
 * they do not inherit subtasks. A subtask is a task with its own assignee and
 * due date, so copying them per occurrence multiplies rows fastest and is the
 * easiest thing to add later.
 * @param {Object} recurrence - The rule.
 * @param {Date} occurrence - The occurrence being created.
 * @param {Object} [transaction] - Enclosing transaction.
 * @return {Promise<Object>} The created task.
 */
export const createInstance = async (recurrence, occurrence, transaction) => {
    const {items: checklist} = normaliseChecklist(
        (recurrence.checklist || []).map((item) => ({...item, id: '', done: false})),
    );

    const task = await Task.create(
        {
            title: recurrence.title,
            description: recurrence.description,
            status: 'todo',
            priority: recurrence.priority,
            dueDate: occurrence,
            estimateMinutes: recurrence.estimateMinutes,
            checklist,
            workspaceId: recurrence.workspaceId,
            createdById: recurrence.createdById,
            recurrenceId: recurrence.id,
            occurrenceDate: occurrence,
        },
        {transaction},
    );

    const assigneeIds = Array.isArray(recurrence.assigneeIds) ? recurrence.assigneeIds : [];
    if (assigneeIds.length > 0) {
        await TaskAssignee.bulkCreate(
            assigneeIds.map((userId) => ({taskId: task.id, userId})),
            {transaction},
        );
    }

    const tagIds = Array.isArray(recurrence.tagIds) ? recurrence.tagIds : [];
    if (tagIds.length > 0) {
        await TaskTag.bulkCreate(
            tagIds.map((tagId) => ({taskId: task.id, tagId})),
            {transaction},
        );
    }

    return task;
};

/**
 * Turn every due occurrence of every active rule into a task.
 *
 * Each occurrence produces an instance even when the previous one is still
 * open, so a list showing three outstanding copies of a weekly task is telling
 * the truth about how far behind the work is.
 * @param {Date} [now] - The instant to run for.
 * @return {Promise<{rules: number, created: number, failed: number}>} Run summary.
 */
export const spawnDueOccurrences = async (now = new Date()) => {
    const rules = await TaskRecurrence.findAll({
        where: {isActive: true},
    });

    let created = 0;
    let failed = 0;

    for (const recurrence of rules) {
        let occurrences;
        try {
            occurrences = dueOccurrences(recurrence, now);
        } catch (error) {
            // One unparseable rule must not stop the run for every other
            // workspace, so it is reported and skipped rather than thrown.
            console.error(`Recurrence ${recurrence.id} has an unusable rule:`, error.message);
            failed += 1;
            continue;
        }

        if (occurrences.length === 0) continue;

        // One transaction per rule, so a partial failure retries cleanly.
        const transaction = await sequelize.transaction();
        const spawned = [];
        try {
            for (const occurrence of occurrences) {
                spawned.push(await createInstance(recurrence, occurrence, transaction));
            }

            await recurrence.update(
                {lastSpawnedAt: occurrences[occurrences.length - 1]},
                {transaction},
            );
            await transaction.commit();
            created += spawned.length;
        } catch (error) {
            await transaction.rollback();
            console.error(`Recurrence ${recurrence.id} failed to spawn:`, error.message);
            failed += 1;
            continue;
        }

        // After the commit: the activity loggers take no transaction and
        // would break their foreign key against uncommitted tasks.
        for (const task of spawned) {
            await logTaskActivity(task.id, recurrence.createdById, 'created', {
                taskTitle: task.title,
                recurrenceId: recurrence.id,
            });
            await logWorkspaceActivity(recurrence.workspaceId, recurrence.createdById, 'task_created', {
                taskId: task.id,
                taskTitle: task.title,
                recurrenceId: recurrence.id,
            });
        }
    }

    return {rules: rules.length, created, failed};
};

/**
 * The next occurrence a rule will produce, for display.
 * @param {Object} recurrence - The rule.
 * @param {Date} [from] - Instant to look forward from.
 * @return {Date|null} The next occurrence, or null when the rule is exhausted.
 */
export const nextOccurrence = (recurrence, from = new Date()) => {
    try {
        return parseRule(recurrence.rrule).after(from, false);
    } catch {
        return null;
    }
};

export default {spawnDueOccurrences, dueOccurrences, createInstance, validateRule, nextOccurrence};
