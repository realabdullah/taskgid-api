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

// User associations
User.hasMany(Task, {foreignKey: 'createdById', as: 'createdTasks'});
User.belongsToMany(Workspace, {through: WorkspaceTeam, as: 'workspaces'});
User.hasMany(Workspace, {foreignKey: 'userId', as: 'ownedWorkspaces'});
User.hasMany(Comment, {foreignKey: 'userId', as: 'comments'});
User.hasMany(Attachment, {foreignKey: 'userId', as: 'attachments'});
User.hasMany(Authn, {foreignKey: 'userId', as: 'authns'});

// Workspace associations
Workspace.belongsTo(User, {foreignKey: 'userId', as: 'user'});
Workspace.belongsToMany(User, {through: WorkspaceTeam, as: 'team'});
Workspace.hasMany(Task, {foreignKey: 'workspaceId', as: 'tasks'});
Workspace.hasMany(Invite, {foreignKey: 'workspaceId', as: 'invites'});

// Task associations
Task.belongsTo(Workspace, {foreignKey: 'workspaceId', as: 'workspace'});
Task.belongsTo(User, {foreignKey: 'createdById', as: 'creator'});
Task.belongsToMany(User, {through: 'task_assignees', as: 'assignees'});
Task.hasMany(Comment, {foreignKey: 'taskId', as: 'comments'});
Task.hasMany(Attachment, {foreignKey: 'taskId', as: 'attachments'});
Task.hasMany(TaskActivity, {foreignKey: 'taskId', as: 'activities'});

// Comment associations
Comment.belongsTo(Task, {foreignKey: 'taskId', as: 'task'});
Comment.belongsTo(User, {foreignKey: 'userId', as: 'user'});
Comment.belongsTo(Comment, {foreignKey: 'parentId', as: 'parent'});
Comment.hasMany(Comment, {foreignKey: 'parentId', as: 'replies'});
Comment.hasMany(Attachment, {foreignKey: 'commentId', as: 'attachments'});

// Attachment associations
Attachment.belongsTo(Task, {foreignKey: 'taskId', as: 'task'});
Attachment.belongsTo(Comment, {foreignKey: 'commentId', as: 'comment'});
Attachment.belongsTo(User, {foreignKey: 'userId', as: 'user'});

// Authn associations
Authn.belongsTo(User, {foreignKey: 'userId', as: 'user'});

// Invite associations
Invite.belongsTo(Workspace, {foreignKey: 'workspaceId', as: 'workspace'});

/**
 * Sets up all model associations
 * @return {void}
 */
export default function setupAssociations() {
    // This function is called after all models are initialized
    console.log('Model associations have been set up');
}
