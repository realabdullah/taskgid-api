/**
 * Slack outbound notifications and interactive message actions.
 *
 * Installations are workspace-scoped. Domain events from the webhook event bus
 * fan out here the same way they fan out to webhook endpoints: after the
 * triggering write commits, never inside its transaction.
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {Op} from 'sequelize';
import config from '../config/config.js';
import SlackInstallation, {DEFAULT_SLACK_EVENT_TYPES} from '../models/SlackInstallation.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import Comment from '../models/Comment.js';
import TaskAssignee from '../models/TaskAssignee.js';
import {Workspace} from '../models/Workspace.js';
import {WORKSPACE_EVENTS} from './workspaceEvents.js';
import {logTaskActivity, logWorkspaceActivity} from '../utils/activityLogger.js';

const SLACK_API = 'https://slack.com/api';
const OAUTH_SCOPES = [
    'chat:write',
    'channels:read',
    'groups:read',
    'users:read',
    'users:read.email',
].join(',');
const STATE_TTL_SECONDS = 10 * 60;
const SIGNATURE_MAX_AGE_SECONDS = 60 * 5;

/**
 * Whether Slack app credentials are configured.
 * @return {boolean} True when OAuth can run.
 */
export const isSlackConfigured = () => Boolean(
    process.env.SLACK_CLIENT_ID &&
    process.env.SLACK_CLIENT_SECRET &&
    process.env.SLACK_SIGNING_SECRET,
);

/**
 * Public origin of this API, used to build OAuth and interactivity URLs.
 * @return {string} Absolute origin with no trailing slash.
 */
const apiOrigin = () => {
    const base = process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 8001}`;
    return base.replace(/\/$/, '');
};

/**
 * Frontend origin, used after OAuth completes.
 * @return {string} Absolute origin with no trailing slash.
 */
const frontendOrigin = () => (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

/**
 * Deep-link into a task inside the product UI.
 * @param {string} workspaceSlug - Workspace slug.
 * @param {string} taskId - Task id.
 * @return {string} Absolute task URL.
 */
const taskUrl = (workspaceSlug, taskId) =>
    `${frontendOrigin()}/app/workspaces/${workspaceSlug}/tasks?taskId=${taskId}`;

/**
 * Signs a short-lived OAuth state token binding the install to a workspace admin.
 * @param {Object} params - State contents.
 * @param {string} params.workspaceId - Workspace being connected.
 * @param {string} params.userId - Admin who started the install.
 * @return {string} Signed JWT.
 */
export const createOAuthState = ({workspaceId, userId}) => jwt.sign(
    {workspaceId, userId, purpose: 'slack-oauth'},
    config.jwt.secret,
    {algorithm: 'HS512', expiresIn: STATE_TTL_SECONDS},
);

/**
 * Verifies an OAuth state token.
 * @param {string} state - Token from the callback query string.
 * @return {{workspaceId: string, userId: string}|null} Claims, or null when invalid.
 */
export const verifyOAuthState = (state) => {
    try {
        const claims = jwt.verify(state, config.jwt.secret, {algorithms: ['HS512']});
        if (claims.purpose !== 'slack-oauth' || !claims.workspaceId || !claims.userId) return null;
        return {workspaceId: claims.workspaceId, userId: claims.userId};
    } catch {
        return null;
    }
};

/**
 * Builds the Slack authorize URL for a workspace install.
 * @param {Object} params - Install context.
 * @param {string} params.workspaceId - Workspace being connected.
 * @param {string} params.userId - Admin who started the install.
 * @return {string} Absolute authorize URL.
 */
export const buildAuthorizeUrl = ({workspaceId, userId}) => {
    const state = createOAuthState({workspaceId, userId});
    const params = new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID,
        scope: OAUTH_SCOPES,
        redirect_uri: `${apiOrigin()}/slack/oauth/callback`,
        state,
    });
    return `https://slack.com/oauth/v2/authorize?${params}`;
};

/**
 * Calls a Slack Web API method.
 * @param {string} method - Method name, e.g. `chat.postMessage`.
 * @param {Object} options - Call options.
 * @param {string} [options.token] - Bot token; omitted for oauth.v2.access.
 * @param {Object} [options.body] - JSON body for POST.
 * @param {URLSearchParams|Object} [options.form] - Form body (oauth exchange).
 * @return {Promise<Object>} Parsed Slack response body.
 */
const slackApi = async (method, {token, body, form} = {}) => {
    const headers = {Accept: 'application/json'};
    let requestBody;

    if (form) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        requestBody = form instanceof URLSearchParams ? form : new URLSearchParams(form);
    } else if (body !== undefined) {
        headers['Content-Type'] = 'application/json; charset=utf-8';
        requestBody = JSON.stringify(body);
    }
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${SLACK_API}/${method}`, {
        method: 'POST',
        headers,
        body: requestBody,
        signal: AbortSignal.timeout(8000),
    });
    return response.json();
};

/**
 * Exchanges an OAuth code for a bot token and upserts the installation.
 * @param {Object} params - Callback parameters.
 * @param {string} params.code - Authorization code from Slack.
 * @param {string} params.workspaceId - Workspace from the state token.
 * @param {string} params.userId - Admin who started the install.
 * @return {Promise<SlackInstallation>} The saved installation.
 */
export const completeOAuth = async ({code, workspaceId, userId}) => {
    const result = await slackApi('oauth.v2.access', {
        form: {
            client_id: process.env.SLACK_CLIENT_ID,
            client_secret: process.env.SLACK_CLIENT_SECRET,
            code,
            redirect_uri: `${apiOrigin()}/slack/oauth/callback`,
        },
    });

    if (!result.ok) {
        const error = new Error(result.error || 'Slack OAuth failed');
        error.status = 400;
        throw error;
    }

    const botToken = result.access_token;
    const teamId = result.team?.id;
    const teamName = result.team?.name || null;
    const botUserId = result.bot_user_id || result.authed_user?.id || null;

    if (!botToken || !teamId) {
        const error = new Error('Slack OAuth response was missing a bot token or team id');
        error.status = 400;
        throw error;
    }

    const [installation, created] = await SlackInstallation.findOrCreate({
        where: {workspaceId},
        defaults: {
            workspaceId,
            teamId,
            teamName,
            botToken,
            botUserId,
            eventTypes: DEFAULT_SLACK_EVENT_TYPES,
            installedById: userId,
            isActive: true,
        },
    });

    if (!created) {
        await installation.update({
            teamId,
            teamName,
            botToken,
            botUserId,
            installedById: userId,
            isActive: true,
        });
    }

    return installation;
};

/**
 * Lists public and private channels the bot can see.
 * @param {SlackInstallation} installation - Connected installation.
 * @return {Promise<Array<{id: string, name: string, isPrivate: boolean}>>} Channels.
 */
export const listChannels = async (installation) => {
    const channels = [];
    let cursor;

    do {
        const form = {
            limit: '200',
            types: 'public_channel,private_channel',
            exclude_archived: 'true',
        };
        if (cursor) form.cursor = cursor;

        const result = await slackApi('conversations.list', {
            token: installation.botToken,
            form,
        });
        if (!result.ok) {
            const error = new Error(result.error || 'Failed to list Slack channels');
            error.status = 502;
            throw error;
        }

        for (const channel of result.channels || []) {
            channels.push({
                id: channel.id,
                name: channel.name,
                isPrivate: Boolean(channel.is_private),
            });
        }
        cursor = result.response_metadata?.next_cursor || null;
    } while (cursor);

    return channels.sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Human label for a task status.
 * @param {string} status - Task status enum value.
 * @return {string} Display label.
 */
const statusLabel = (status) => ({
    todo: 'To do',
    in_progress: 'In progress',
    done: 'Done',
}[status] || status);

/**
 * Human label for a workspace event type.
 * @param {string} type - One of WORKSPACE_EVENTS.
 * @return {string} Display label.
 */
const eventLabel = (type) => ({
    [WORKSPACE_EVENTS.TASK_CREATED]: 'Task created',
    [WORKSPACE_EVENTS.TASK_UPDATED]: 'Task updated',
    [WORKSPACE_EVENTS.TASK_DELETED]: 'Task deleted',
    [WORKSPACE_EVENTS.COMMENT_CREATED]: 'New comment',
}[type] || type);

/**
 * Loads enough context to render a Slack message for an event.
 * @param {Object} event - Persisted workspace event (plain or model).
 * @return {Promise<Object|null>} Context, or null when the subject is gone.
 */
const loadEventContext = async (event) => {
    const workspace = await Workspace.findByPk(event.workspaceId, {
        attributes: ['id', 'title', 'slug'],
    });
    if (!workspace) return null;

    const actor = event.actorId ?
        await User.findByPk(event.actorId, {
            attributes: ['id', 'username', 'firstName', 'lastName'],
        }) :
        null;
    const actorName = actor ?
        (actor.firstName || actor.username) :
        'Someone';

    const taskId = event.payload?.taskId;
    let task = null;
    if (taskId && event.type !== WORKSPACE_EVENTS.TASK_DELETED) {
        task = await Task.findByPk(taskId, {
            attributes: ['id', 'title', 'status', 'priority', 'dueDate'],
        });
    }

    let commentPreview = null;
    if (event.type === WORKSPACE_EVENTS.COMMENT_CREATED && event.payload?.commentId) {
        const comment = await Comment.findByPk(event.payload.commentId, {
            attributes: ['id', 'content'],
        });
        if (comment?.content) {
            const plain = String(comment.content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            commentPreview = plain.length > 200 ? `${plain.slice(0, 197)}…` : plain;
        }
    }

    return {
        workspace,
        actorName,
        task,
        taskId,
        taskTitle: task?.title || event.payload?.taskTitle || 'a task',
        commentPreview,
    };
};

/**
 * Builds Block Kit blocks for a domain event.
 * @param {Object} event - Workspace event.
 * @param {Object} context - From `loadEventContext`.
 * @return {Object} `{text, blocks}` for chat.postMessage.
 */
const buildMessage = (event, context) => {
    const {workspace, actorName, task, taskId, taskTitle, commentPreview} = context;
    const url = taskId ? taskUrl(workspace.slug, taskId) : `${frontendOrigin()}/app/workspaces/${workspace.slug}`;
    const headline = `*${eventLabel(event.type)}* in *${workspace.title}*`;
    const byline = `by ${actorName}`;

    const fields = [];
    if (task) {
        fields.push({type: 'mrkdwn', text: `*Status*\n${statusLabel(task.status)}`});
        fields.push({type: 'mrkdwn', text: `*Priority*\n${task.priority}`});
    } else if (event.payload?.status) {
        fields.push({type: 'mrkdwn', text: `*Status*\n${statusLabel(event.payload.status)}`});
    }

    const blocks = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `${headline}\n<${url}|${taskTitle}> · ${byline}`,
            },
        },
    ];

    if (fields.length > 0) {
        blocks.push({type: 'section', fields});
    }

    if (commentPreview) {
        blocks.push({
            type: 'section',
            text: {type: 'mrkdwn', text: `> ${commentPreview}`},
        });
    }

    if (task && task.status !== 'done') {
        blocks.push({
            type: 'actions',
            block_id: `task_actions:${task.id}`,
            elements: [
                {
                    type: 'button',
                    action_id: 'task_mark_done',
                    text: {type: 'plain_text', text: 'Mark done'},
                    style: 'primary',
                    value: JSON.stringify({
                        workspaceId: workspace.id,
                        taskId: task.id,
                    }),
                },
                {
                    type: 'button',
                    action_id: 'task_claim',
                    text: {type: 'plain_text', text: 'Claim'},
                    value: JSON.stringify({
                        workspaceId: workspace.id,
                        taskId: task.id,
                    }),
                },
                {
                    type: 'button',
                    action_id: 'task_open',
                    text: {type: 'plain_text', text: 'Open'},
                    url,
                },
            ],
        });
    } else {
        blocks.push({
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    action_id: 'task_open',
                    text: {type: 'plain_text', text: 'Open in Taskgid'},
                    url,
                },
            ],
        });
    }

    return {
        text: `${eventLabel(event.type)}: ${taskTitle}`,
        blocks,
    };
};

/**
 * Posts a domain event to the workspace's configured Slack channel, if any.
 *
 * Failures are swallowed: a Slack outage must not turn a successful write into
 * a failed request for the user who made it.
 * @param {Object} event - Persisted workspace event.
 * @return {Promise<void>} Resolves once the attempt finishes or is skipped.
 */
export const notifySlackForEvent = async (event) => {
    if (!event?.workspaceId || !event?.type) return;

    try {
        const installation = await SlackInstallation.findOne({
            where: {
                workspaceId: event.workspaceId,
                isActive: true,
                channelId: {[Op.ne]: null},
                eventTypes: {[Op.contains]: [event.type]},
            },
        });
        if (!installation) return;

        const context = await loadEventContext(event);
        if (!context) return;

        const message = buildMessage(event, context);
        const result = await slackApi('chat.postMessage', {
            token: installation.botToken,
            body: {
                channel: installation.channelId,
                text: message.text,
                blocks: message.blocks,
                unfurl_links: false,
                unfurl_media: false,
            },
        });

        if (!result.ok) {
            console.error(`Slack postMessage failed for workspace ${event.workspaceId}:`, result.error);
        }
    } catch (error) {
        console.error(`Slack notify failed for workspace ${event.workspaceId}:`, error.message);
    }
};

/**
 * Verifies a Slack request signature (v0).
 * @param {Object} params - Raw request pieces.
 * @param {string} params.signature - `X-Slack-Signature` header.
 * @param {string} params.timestamp - `X-Slack-Request-Timestamp` header.
 * @param {string|Buffer} params.rawBody - Exact body bytes Slack signed.
 * @return {boolean} True when the signature matches and is fresh.
 */
export const verifySlackSignature = ({signature, timestamp, rawBody}) => {
    const secret = process.env.SLACK_SIGNING_SECRET;
    if (!secret || !signature || !timestamp) return false;

    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - ts) > SIGNATURE_MAX_AGE_SECONDS) return false;

    const base = `v0:${timestamp}:${rawBody}`;
    const digest = crypto.createHmac('sha256', secret).update(base).digest('hex');
    const expected = `v0=${digest}`;

    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
        return false;
    }
};

/**
 * Resolves the Taskgid user for a Slack action by email, when available.
 * @param {Object} payload - Slack interaction payload.
 * @param {SlackInstallation} installation - Installation for the team.
 * @return {Promise<User|null>} Matching user, or null.
 */
const resolveActingUser = async (payload, installation) => {
    const slackUserId = payload.user?.id;
    if (!slackUserId) return null;

    try {
        const result = await slackApi('users.info', {
            token: installation.botToken,
            form: {user: slackUserId},
        });
        const email = result.user?.profile?.email;
        if (email) {
            const byEmail = await User.findOne({where: {email: email.toLowerCase()}});
            if (byEmail) return byEmail;
        }
    } catch (error) {
        console.error('Slack users.info failed:', error.message);
    }

    // Fall back to whoever installed the integration so claim/done still work
    // when Slack does not share email (enterprise grid, restricted profile).
    return User.findByPk(installation.installedById);
};

/**
 * Marks a task done from a Slack button.
 * @param {Object} params - Action context.
 * @param {User} params.user - Acting Taskgid user.
 * @param {string} params.taskId - Task to complete.
 * @param {string} params.workspaceId - Owning workspace.
 * @return {Promise<string>} Ephemeral response text.
 */
const handleMarkDone = async ({user, taskId, workspaceId}) => {
    const task = await Task.findOne({where: {id: taskId, workspaceId}});
    if (!task) return 'That task no longer exists.';
    if (task.status === 'done') return `"${task.title}" is already done.`;

    const previousStatus = task.status;
    await task.update({status: 'done'});
    await logTaskActivity(task.id, user.id, 'status_changed', {
        taskId: task.id,
        taskTitle: task.title,
        changeDetails: {field: 'status', oldValue: previousStatus, newValue: 'done'},
        source: 'slack',
    });
    await logWorkspaceActivity(workspaceId, user.id, 'task_updated', {
        taskId: task.id,
        taskTitle: task.title,
    });

    return `Marked *${task.title}* done.`;
};

/**
 * Assigns the acting user to a task from a Slack button.
 * @param {Object} params - Action context.
 * @param {User} params.user - Acting Taskgid user.
 * @param {string} params.taskId - Task to claim.
 * @param {string} params.workspaceId - Owning workspace.
 * @return {Promise<string>} Ephemeral response text.
 */
const handleClaim = async ({user, taskId, workspaceId}) => {
    const task = await Task.findOne({where: {id: taskId, workspaceId}});
    if (!task) return 'That task no longer exists.';

    const existing = await TaskAssignee.findOne({where: {taskId, userId: user.id}});
    if (existing) return `You are already on *${task.title}*.`;

    await TaskAssignee.create({taskId, userId: user.id});
    await logTaskActivity(task.id, user.id, 'assigned', {
        taskId: task.id,
        taskTitle: task.title,
        assigneeIds: [user.id],
        source: 'slack',
    });
    await logWorkspaceActivity(workspaceId, user.id, 'task_assigned', {
        taskId: task.id,
        taskTitle: task.title,
        assigneeIds: [user.id],
    });

    return `You claimed *${task.title}*.`;
};

/**
 * Handles a Slack block_actions interaction payload.
 * @param {Object} payload - Parsed Slack payload.
 * @return {Promise<Object>} Response body for Slack (`text`, optional `response_type`).
 */
export const handleInteraction = async (payload) => {
    if (payload.type !== 'block_actions') {
        return {text: 'Unsupported interaction.'};
    }

    const action = payload.actions?.[0];
    if (!action) return {text: 'No action received.'};

    if (action.action_id === 'task_open') {
        return {text: 'Opening in Taskgid.'};
    }

    let value;
    try {
        value = JSON.parse(action.value || '{}');
    } catch {
        return {text: 'That button is no longer valid.'};
    }

    const {workspaceId, taskId} = value;
    if (!workspaceId || !taskId) return {text: 'That button is no longer valid.'};

    const installation = await SlackInstallation.findOne({
        where: {workspaceId, teamId: payload.team?.id, isActive: true},
    });
    if (!installation) return {text: 'This Slack workspace is no longer connected to Taskgid.'};

    const user = await resolveActingUser(payload, installation);
    if (!user) {
        return {
            text: 'Could not match your Slack account to a Taskgid user. ' +
                'Sign in to Taskgid with the same email, or reconnect Slack.',
        };
    }

    if (action.action_id === 'task_mark_done') {
        const text = await handleMarkDone({user, taskId, workspaceId});
        return {text, response_type: 'ephemeral'};
    }

    if (action.action_id === 'task_claim') {
        const text = await handleClaim({user, taskId, workspaceId});
        return {text, response_type: 'ephemeral'};
    }

    return {text: 'Unknown action.'};
};

/**
 * Frontend URL to land on after OAuth, with a status query flag.
 * @param {string} workspaceSlug - Workspace slug.
 * @param {'connected'|'error'} status - Outcome.
 * @param {string} [error] - Optional error code.
 * @return {string} Absolute frontend URL.
 */
export const oauthReturnUrl = (workspaceSlug, status, error) => {
    const url = new URL(`${frontendOrigin()}/app/workspaces/${workspaceSlug}/settings`);
    url.searchParams.set('slack', status);
    if (error) url.searchParams.set('slack_error', error);
    return url.toString();
};

export default {
    isSlackConfigured,
    buildAuthorizeUrl,
    completeOAuth,
    verifyOAuthState,
    listChannels,
    notifySlackForEvent,
    verifySlackSignature,
    handleInteraction,
    oauthReturnUrl,
    DEFAULT_SLACK_EVENT_TYPES,
};
