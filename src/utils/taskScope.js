import {Op} from 'sequelize';

/**
 * Where a query sits relative to the task hierarchy.
 *
 * A task with a NULL `parentId` is top-level; anything else is a subtask. Three
 * rules decide which of the two a given query wants, and every task query in
 * the API falls under exactly one of them:
 *
 * 1. The default task list shows top-level work only, so adopting subtasks does
 *    not bury the list under rows that already appear under their parent.
 * 2. An explicit filter — an assignee, a search term, a tag, a date range —
 *    deliberately cuts across the hierarchy, so a subtask assigned to someone or
 *    overdue still reaches them.
 * 3. Headline statistics count top-level work only, so figures stay comparable
 *    with what they reported before subtasks existed. Subtask progress is
 *    reported as its own figure rather than folded into the old ones.
 *
 * Importing this instead of writing `parentId: null` inline keeps the choice
 * visible at each call site and greppable across the codebase.
 */

/** Where-clause fragment restricting a Task query to top-level tasks. */
export const TOP_LEVEL_ONLY = {parentId: null};

/** Where-clause fragment restricting a Task query to subtasks. */
export const SUBTASKS_ONLY = {parentId: {[Op.ne]: null}};

/**
 * The same restriction for raw SQL, where the model helpers do not reach.
 * @param {string} alias - Table or alias holding the task row.
 * @return {string} A boolean SQL expression.
 */
export const topLevelOnlySql = (alias) => `${alias}.parent_id IS NULL`;

/**
 * Whether a request asked to see subtasks alongside top-level tasks.
 *
 * The default list is top-level only, but a caller can opt in, and any explicit
 * filter opts in on the caller's behalf under rule 2.
 * @param {Object} query - Express request query.
 * @param {boolean} hasExplicitFilter - Whether a filter that cuts across the
 *   hierarchy is active on this request.
 * @return {boolean} True when subtasks belong in the result.
 */
export const shouldIncludeSubtasks = (query, hasExplicitFilter = false) => {
    if (query.includeSubtasks === 'true') return true;
    if (query.includeSubtasks === 'false') return false;
    return hasExplicitFilter;
};
