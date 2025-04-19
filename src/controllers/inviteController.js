import jwt from 'jsonwebtoken';
import {Workspace} from '../models/Workspace.js';
import User from '../models/User.js';
import Invite from '../models/Invite.js';
import {acceptInviteNotification} from '../services/pusher.js';
import {sendInviteNotification as sendKnockInviteNotification} from '../services/knock.js';
import 'dotenv/config';

const inviteUser = async (req, res) => {
    const {email, slug} = req.body;

    try {
        const workspace = await Workspace.findOne({where: {slug}});
        if (!workspace) {
            return res.status(404).json({message: 'Workspace not found'});
        }

        const user = await User.findOne({where: {email}});
        let isNewUser = false;
        if (!user) {
            isNewUser = true;
        } else {
            // Check if user is already in the workspace
            const isInWorkspace = await workspace.hasUser(user.id);
            if (isInWorkspace) {
                return res.status(400).json({message: 'User already in workspace'});
            }
        }

        const token = jwt.sign({email, workspaceId: workspace.id, isNew: isNewUser}, process.env.JWT_SECRET);
        const url = `${process.env.CLIENT_URL}/accept/${token}`;

        await Invite.create({token});

        const userInfo = {email, firstName: isNewUser ? '' : user?.firstName};
        sendKnockInviteNotification(userInfo, workspace.title, req.user, url);

        res.status(201).json({message: 'User invited successfully'});
    } catch (error) {
        console.error('Invite error:', error);
        res.status(500).json({message: 'Server error'});
    }
};

const acceptInvite = async (req, res) => {
    const {token} = req.body;

    try {
        const invite = await Invite.findOne({where: {token}});
        if (!invite) {
            return res.status(404).json({message: 'Invite not found'});
        }

        if (invite.used) {
            return res.status(400).json({message: 'Invite already used'});
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const {email, workspaceId, isNew} = decoded;

        const workspace = await Workspace.findByPk(workspaceId, {
            include: [
                {model: User, as: 'user', attributes: ['firstName', 'lastName']},
                {model: User, as: 'team', attributes: ['firstName', 'lastName', 'username', 'profilePicture', 'email']},
            ],
        });

        if (!workspace) {
            return res.status(404).json({message: 'Workspace not found'});
        }

        const user = await User.findOne({where: {email}});

        if (user) {
            await workspace.addUser(user.id);
            invite.used = true;
            await invite.save();

            acceptInviteNotification(
                workspace.user.id, workspace, user,
            );
        }

        res.status(200).json({success: true, isNew});
    } catch (error) {
        console.error('Accept invite error:', error);
        res.status(401).json({message: 'Invalid token', success: false});
    }
};

export {inviteUser, acceptInvite};
