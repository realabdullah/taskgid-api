import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import {Workspace} from '../models/Workspace.js';
import WorkspaceTeam from '../models/WorkspaceTeam.js';
import {
    addTask,
    updateTask,
    fetchWorkspaceTasks,
    advancedSearchTasks,
} from '../controllers/taskController.js';
import {addTaskComment} from '../controllers/commentController.js';
import {getWorkspaceStatistics} from '../controllers/statisticsController.js';
import {invokeHandler} from '../utils/invokeHandler.js';
import {runAsAgent, logTaskActivity} from '../utils/activityLogger.js';

/**
 * Loads the workspace an API key is scoped to and confirms the issuer is still
 * a member. Throws a plain Error with a `status` when either check fails.
 * @param {Object} apiKey - Active ApiKey row.
 * @param {Object} user - Issuing user.
 * @return {Promise<Workspace>} The workspace.
 */
const resolveScopedWorkspace = async (apiKey, user) => {
    const workspace = await Workspace.findByPk(apiKey.workspaceId);
    if (!workspace) {
        const err = new Error('Workspace not found for this API key');
        err.status = 404;
        throw err;
    }

    const membership = await WorkspaceTeam.findOne({
        where: {workspaceId: workspace.id, userId: user.id},
    });
    if (!membership) {
        const err = new Error('You are no longer a member of this workspace');
        err.status = 403;
        throw err;
    }

    return workspace;
};

/**
 * Turns a controller response into an MCP tool result.
 * @param {{status: number, body: Object}} result - Captured controller output.
 * @return {Object} MCP CallToolResult.
 */
const toToolResult = (result) => {
    const ok = result.status >= 200 && result.status < 300 && result.body?.success !== false;
    const text = JSON.stringify(result.body, null, 2);
    return {
        content: [{type: 'text', text}],
        isError: !ok,
    };
};

/**
 * Builds a fresh MCP server whose tools act as the given API-key identity.
 *
 * Stateless per request: the Streamable HTTP transport creates one of these
 * for every POST, so nothing is shared across serverless invocations.
 * @param {Object} ctx - Auth context from the HTTP request.
 * @param {Object} ctx.user - Issuing user.
 * @param {Object} ctx.apiKey - Active workspace-scoped API key.
 * @return {McpServer} Configured server with the six tools registered.
 */
export const createMcpServer = (ctx) => {
    const {user, apiKey} = ctx;
    const server = new McpServer({
        name: 'taskgid',
        version: '1.0.0',
    });

    /**
     * Shared prelude: resolve the key's workspace and build the fake request
     * pieces controllers expect.
     * @return {Promise<{workspace: Workspace, base: Object}>} Scope + request base.
     */
    const scoped = async () => {
        const workspace = await resolveScopedWorkspace(apiKey, user);
        return {
            workspace,
            base: {
                user,
                apiKey,
                params: {workspaceSlug: workspace.slug},
            },
        };
    };

    server.tool(
        'list_tasks',
        'List tasks in the workspace the API key is scoped to. ' +
            'Supports the same filters as GET /workspaces/:slug/tasks.',
        {
            page: z.number().int().min(1).optional().describe('Page number, default 1'),
            limit: z.number().int().min(1).max(100).optional().describe('Page size, default 50'),
            search: z.string().optional().describe('Case-insensitive title/description match'),
            status: z.string().optional()
                .describe('Comma-separated statuses: todo, in_progress, done'),
            priority: z.string().optional()
                .describe('Comma-separated priorities: low, medium, high'),
            assignee: z.string().optional().describe('Username, "me", or "unassigned"'),
            tags: z.string().optional().describe('Comma-separated tag names'),
            parentId: z.string().uuid().optional().describe('List subtasks of this parent'),
        },
        async (args) => {
            const {base} = await scoped();
            const query = {};
            const keys = [
                'page', 'limit', 'search', 'status', 'priority', 'assignee', 'tags', 'parentId',
            ];
            for (const key of keys) {
                if (args[key] !== undefined && args[key] !== null) query[key] = String(args[key]);
            }
            const result = await invokeHandler(fetchWorkspaceTasks, {...base, query});
            return toToolResult(result);
        },
    );

    server.tool(
        'search_tasks',
        'Advanced task search in the workspace the API key is scoped to. ' +
            'Same filters as GET /workspaces/:slug/tasks/search.',
        {
            page: z.number().int().min(1).optional(),
            limit: z.number().int().min(1).max(100).optional(),
            search: z.string().optional().describe('Match title, description, and optionally comments'),
            status: z.string().optional(),
            priority: z.string().optional(),
            assignee: z.string().optional(),
            creator: z.string().optional().describe('Creator username'),
            tags: z.string().optional(),
            dueDateFrom: z.string().optional().describe('ISO date lower bound on due date'),
            dueDateTo: z.string().optional().describe('ISO date upper bound on due date'),
            createdFrom: z.string().optional(),
            createdTo: z.string().optional(),
            sortBy: z.string().optional().describe('createdAt, updatedAt, dueDate, priority, status, title'),
            sortOrder: z.enum(['ASC', 'DESC']).optional(),
            includeComments: z.boolean().optional().describe('Also search comment bodies'),
        },
        async (args) => {
            const {base} = await scoped();
            const query = {};
            for (const [key, value] of Object.entries(args)) {
                if (value !== undefined && value !== null) query[key] = String(value);
            }
            const result = await invokeHandler(advancedSearchTasks, {...base, query});
            return toToolResult(result);
        },
    );

    server.tool(
        'create_task',
        'Create a task in the workspace the API key is scoped to. Same body as POST /workspaces/:slug/tasks.',
        {
            title: z.string().min(1).describe('Task title'),
            description: z.string().optional(),
            status: z.enum(['todo', 'in_progress', 'done']).optional(),
            priority: z.enum(['low', 'medium', 'high']).optional(),
            dueDate: z.string().optional().describe('ISO datetime'),
            startDate: z.string().optional().describe('ISO datetime'),
            estimateMinutes: z.number().int().min(0).optional(),
            assignees: z.array(z.string()).optional().describe('Assignee usernames'),
            tags: z.array(z.string()).optional().describe('Tag names'),
            parentId: z.string().uuid().optional().describe('Parent task id for a subtask'),
            checklist: z.array(z.object({
                text: z.string(),
                done: z.boolean().optional(),
            })).optional(),
        },
        async (args) => {
            const {base} = await scoped();
            const result = await runAsAgent(() =>
                invokeHandler(addTask, {...base, body: args}),
            );
            return toToolResult(result);
        },
    );

    server.tool(
        'update_task',
        'Update a task in the workspace the API key is scoped to. Same body as PATCH /workspaces/:slug/tasks/:id.',
        {
            taskId: z.string().uuid().describe('Task id'),
            title: z.string().min(1).optional(),
            description: z.string().optional(),
            status: z.enum(['todo', 'in_progress', 'done']).optional(),
            priority: z.enum(['low', 'medium', 'high']).optional(),
            dueDate: z.string().nullable().optional(),
            startDate: z.string().nullable().optional(),
            estimateMinutes: z.number().int().min(0).nullable().optional(),
            assignees: z.array(z.string()).optional().describe('Replacement assignee usernames'),
            tags: z.array(z.string()).optional().describe('Replacement tag names'),
            parentId: z.string().uuid().nullable().optional(),
            checklist: z.array(z.object({
                id: z.string().optional(),
                text: z.string(),
                done: z.boolean().optional(),
            })).optional(),
        },
        async (args) => {
            const {base} = await scoped();
            const {taskId, ...body} = args;
            const result = await runAsAgent(() =>
                invokeHandler(updateTask, {
                    ...base,
                    params: {...base.params, id: taskId},
                    body,
                }),
            );
            return toToolResult(result);
        },
    );

    server.tool(
        'add_comment',
        'Add a comment to a task in the workspace the API key is scoped to.',
        {
            taskId: z.string().uuid().describe('Task id'),
            content: z.string().min(1).describe('Comment body (rich text allowed)'),
            parentId: z.string().uuid().optional().describe('Parent comment id for a reply'),
        },
        async (args) => {
            const {base} = await scoped();
            const result = await runAsAgent(async () => {
                const outcome = await invokeHandler(addTaskComment, {
                    ...base,
                    params: {...base.params, id: args.taskId},
                    body: {content: args.content, parentId: args.parentId},
                });
                if (outcome.status >= 200 && outcome.status < 300 && outcome.body?.data?.id) {
                    await logTaskActivity(args.taskId, user.id, 'comment_added', {
                        commentId: outcome.body.data.id,
                    });
                }
                return outcome;
            });
            return toToolResult(result);
        },
    );

    server.tool(
        'get_workspace_summary',
        'Headline statistics for the workspace the API key is scoped to: ' +
            'totals, status/priority breakdown, overdue, subtasks, member activity.',
        {
            page: z.number().int().min(1).optional().describe('Member-activity page'),
            limit: z.number().int().min(1).max(100).optional().describe('Member-activity page size'),
        },
        async (args) => {
            const {workspace, base} = await scoped();
            // statisticsController reads `slug`, not `workspaceSlug`.
            const result = await invokeHandler(getWorkspaceStatistics, {
                ...base,
                params: {slug: workspace.slug, workspaceSlug: workspace.slug},
                query: {
                    page: args.page !== undefined ? String(args.page) : undefined,
                    limit: args.limit !== undefined ? String(args.limit) : undefined,
                },
            });
            return toToolResult(result);
        },
    );

    return server;
};
