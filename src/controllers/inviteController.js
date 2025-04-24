import jwt from 'jsonwebtoken';
import {Workspace} from '../models/Workspace.js';
import User from '../models/User.js';
import Invite from '../models/Invite.js';
import WorkspaceTeam from '../models/WorkspaceTeam.js';
import {acceptInviteNotification} from '../services/pusher.js';
import emailService from '../utils/emailService.js';
import 'dotenv/config';
import {generateUsername} from '../utils/usernameGenerator.js';
import crypto from 'crypto';

const inviteUser = async (req, res) => {
    const {email, workspaceId} = req.body;
    const inviterUser = req.user;

    try {
        const workspace = await Workspace.findByPk(workspaceId);
        if (!workspace) {
            return res.status(404).json({error: 'Workspace not found'});
        }

        const requestorRole = await WorkspaceTeam.findOne({where: {userId: inviterUser.id, workspaceId}});
        if (!requestorRole || !['creator', 'admin'].includes(requestorRole.role)) {
            return res.status(403).json({error: 'Only workspace admins or the creator can send invites'});
        }

        const pendingInvite = await Invite.findOne({where: {email, workspaceId, used: false}});
        console.log('pendingInvite', pendingInvite);
        if (pendingInvite) {
            return res.status(400).json({error: 'User already has a pending invite to this workspace'});
        }

        const existingUser = await User.findOne({where: {email}});
        if (existingUser) {
            const existingMember = await WorkspaceTeam.findOne({where: {userId: existingUser.id, workspaceId}});
            if (existingMember) {
                return res.status(400).json({error: 'User is already a member of this workspace'});
            }
        }

        const token = jwt.sign(
            {email, workspaceId},
            process.env.JWT_SECRET,
            {expiresIn: '7d'},
        );

        const inviteUrl = `${process.env.APP_URL}/accept-invite/${token}`;

        await Invite.create({
            email,
            token,
            workspaceId: workspace.id,
            invitedById: inviterUser.id,
        });

        const inviteeDetails = {email, name: existingUser?.firstName};
        const mailerSendResponse = await emailService.sendWorkspaceInviteEmail(
            inviteeDetails, inviterUser, workspace, inviteUrl,
        );

        if (!mailerSendResponse) {
            console.warn(`Failed to send invite email to ${email} via MailerSend, but invite record created.`);
        }

        res.status(201).json({message: 'User invited successfully'});
    } catch (error) {
        console.error('Invite User error:', error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).json({error: 'Database constraint error (likely duplicate invite attempt).'});
        }
        res.status(500).json({error: 'Server error during invitation process'});
    }
};

const acceptInvite = async (req, res) => {
    const {token} = req.body;

    if (!token) {
        return res.status(400).json({message: 'Invite token is required', success: false});
    }

    try {
        // 1. Verify JWT token & find Invite record
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({message: 'Invalid or expired invite token', success: false});
        }

        const invite = await Invite.findOne({where: {token, used: false}});
        if (!invite) {
            return res.status(404).json({message: 'Invite not found or already used', success: false});
        }

        const {email, workspaceId} = decoded;

        // 2. Find Workspace
        const workspace = await Workspace.findByPk(workspaceId, {
            include: [{model: User, as: 'user', attributes: ['id', 'firstName']}],
        });
        if (!workspace) {
            return res.status(404).json({message: 'Associated workspace not found', success: false});
        }

        // 3. Find or Create User
        let user = await User.findOne({where: {email}});
        let isNewUser = false;

        if (user) {
            // Existing User Flow
            // Check if already a member of this workspace
            const existingMember = await WorkspaceTeam.findOne({
                where: {userId: user.id, workspaceId: workspace.id},
            });

            if (existingMember) {
                // Already a member, just mark invite used
                invite.used = true;
                await invite.save();
                return res.status(200).json({success: true, message: 'Already a member of this workspace', isNewUser});
            }
        } else {
            // New User Flow - Create a placeholder user
            isNewUser = true;
            const tempPassword = crypto.randomBytes(16).toString('hex');
            const generatedUsername = await generateUsername(email);

            user = await User.create({
                email,
                username: generatedUsername,
                password: tempPassword,
                registrationSource: 'invite',
                invitedBy: invite.invitedById,
            });
        }

        // 4. Add user to Workspace Team
        await WorkspaceTeam.create({
            userId: user.id,
            workspaceId: workspace.id,
        });

        // 5. Mark invite as used
        invite.used = true;
        await invite.save();

        // 6. Send notification to workspace owner (optional)
        if (workspace.user) {
            acceptInviteNotification(workspace.user.id, workspace, user);
        }

        // Respond indicating success and if the user was newly created
        res.status(200).json({success: true, message: 'Invite accepted successfully', isNewUser});
    } catch (error) {
        console.error('Accept invite error:', error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).json({
                message: 'Failed due to data conflict (e.g., username). Please try again or contact support.',
                success: false,
            });
        }
        res.status(500).json({message: 'Failed to accept invite due to server error', success: false});
    }
};

export {inviteUser, acceptInvite};
