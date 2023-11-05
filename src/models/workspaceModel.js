/* eslint-disable no-invalid-this */
import {Schema, model} from 'mongoose';
import WorkspaceTeam from './workspaceTeamModel.js';

const workspaceSchema = new Schema({
    title: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    slug: {
        type: String,
        unique: true,
        required: true,
    },
    avatar: {
        type: String,
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
});

workspaceSchema.set('toJSON', {
    transform: (doc, ret, options) => {
        delete ret.__v;
        ret.owner = `${ret.user.firstName} ${ret.user.lastName}`;
        delete ret.user;
        delete ret._id;
        return ret;
    },
});

workspaceSchema.pre('save', async function(next) {
    const initials = this.title
        .split(' ')
        .map((n) => n[0])
        .join('');

    const avatarUrl = `https://ui-avatars.com/api/?name=${initials}&background=random&color=fff`;
    this.avatar = avatarUrl;

    next();
});


workspaceSchema.post('save', async function(doc) {
    const workspaceTeam = new WorkspaceTeam({user: doc.user, workspace: doc._id});
    await workspaceTeam.save();
});

const Workspace = model('Workspace', workspaceSchema);

export default Workspace;
