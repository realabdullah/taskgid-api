/**
 * This file centralizes all model associations to avoid circular dependencies
 */
import User from './User.js';
import {Workspace} from './Workspace.js';
import Task from './Task.js';
import Comment from './Comment.js';
import Attachment from './Attachment.js';
import TaskActivity from './TaskActivity.js';
import Authn from './Authn.js';
import Invite from './Invite.js';
import WorkspaceTeam from './WorkspaceTeam.js';
import WorkspaceActivity from './WorkspaceActivity.js';
import TaskAssignee from './TaskAssignee.js';
import CommentLike from './CommentLike.js';

// User associations
User.hasMany(Task, {foreignKey: 'createdById', as: 'createdTasks'});
User.belongsToMany(Task, {through: TaskAssignee, as: 'assignedTasks', foreignKey: 'userId'});
User.belongsToMany(Workspace, {through: WorkspaceTeam, as: 'workspaces'});
User.hasMany(Workspace, {foreignKey: 'userId', as: 'ownedWorkspaces'});
User.hasMany(Comment, {foreignKey: 'userId', as: 'comments'});
User.hasMany(Attachment, {foreignKey: 'userId', as: 'attachments'});
User.hasMany(Authn, {foreignKey: 'userId', as: 'authns'});
User.hasMany(WorkspaceActivity, {foreignKey: 'userId', as: 'workspaceActivities'});
User.hasMany(CommentLike, {foreignKey: 'userId', as: 'commentLikes'});

// Workspace associations
Workspace.belongsTo(User, {foreignKey: 'userId', as: 'user'});
Workspace.belongsToMany(User, {through: WorkspaceTeam, as: 'team'});
Workspace.hasMany(WorkspaceTeam, {foreignKey: 'workspaceId', as: 'teamMembership'});
Workspace.hasMany(Task, {foreignKey: 'workspaceId', as: 'tasks'});
Workspace.hasMany(Invite, {foreignKey: 'workspaceId', as: 'invites'});
Workspace.hasMany(WorkspaceActivity, {foreignKey: 'workspaceId', as: 'activities'});

// WorkspaceTeam associations
WorkspaceTeam.belongsTo(Workspace, {foreignKey: 'workspaceId', as: 'workspace'});
WorkspaceTeam.belongsTo(User, {foreignKey: 'userId', as: 'memberDetail'});

// Task associations
Task.belongsTo(Workspace, {foreignKey: 'workspaceId', as: 'workspace'});
Task.belongsTo(User, {foreignKey: 'createdById', as: 'creator'});
Task.belongsToMany(User, {through: TaskAssignee, as: 'assignees', foreignKey: 'taskId'});
Task.hasMany(Comment, {foreignKey: 'taskId', as: 'comments'});
Task.hasMany(Attachment, {foreignKey: 'taskId', as: 'attachments'});
Task.hasMany(TaskActivity, {foreignKey: 'taskId', as: 'activities'});

// Comment associations
Comment.belongsTo(Task, {foreignKey: 'taskId', as: 'task'});
Comment.belongsTo(User, {foreignKey: 'userId', as: 'user'});
Comment.belongsTo(Comment, {foreignKey: 'parentId', as: 'parent'});
Comment.hasMany(Comment, {foreignKey: 'parentId', as: 'replies'});
Comment.hasMany(Attachment, {foreignKey: 'commentId', as: 'attachments'});
Comment.hasMany(CommentLike, {foreignKey: 'commentId', as: 'likes'});

// Attachment associations
Attachment.belongsTo(Task, {foreignKey: 'taskId', as: 'task'});
Attachment.belongsTo(Comment, {foreignKey: 'commentId', as: 'comment'});
Attachment.belongsTo(User, {foreignKey: 'userId', as: 'user'});

// Authn associations
Authn.belongsTo(User, {foreignKey: 'userId', as: 'user'});

// Invite associations
Invite.belongsTo(Workspace, {foreignKey: 'workspaceId', as: 'workspace'});
Invite.belongsTo(User, {foreignKey: 'invitedById', as: 'invitedBy'});

// WorkspaceActivity associations
WorkspaceActivity.belongsTo(Workspace, {foreignKey: 'workspaceId', as: 'workspace'});
WorkspaceActivity.belongsTo(User, {foreignKey: 'userId', as: 'user'});

// TaskActivity associations
TaskActivity.belongsTo(Task, {foreignKey: 'taskId', as: 'task'});
TaskActivity.belongsTo(User, {foreignKey: 'userId', as: 'user'});

// TaskAssignee associations
TaskAssignee.belongsTo(Task, {foreignKey: 'taskId', as: 'task'});
TaskAssignee.belongsTo(User, {foreignKey: 'userId', as: 'user'});

// CommentLike associations
CommentLike.belongsTo(Comment, {foreignKey: 'commentId', as: 'commentRef'});
CommentLike.belongsTo(User, {foreignKey: 'userId', as: 'userRef'});

/**
 * Sets up all model associations
 * @return {void}
 */
export default function setupAssociations() {
    console.log('Model associations have been set up');
}
