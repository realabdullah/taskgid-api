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
import {logWorkspaceActivity} from '../utils/activityLogger.js';
import {Op} from 'sequelize';
import WorkspaceActivity from '../models/WorkspaceActivity.js';
import {errorResponse, successResponse} from '../utils/responseUtils.js';

const updateActivityLogDetails = async (
    workspaceId,
    activityType,
    findCriteria,
    newDetails,
) => {
    console.log(
        `Attempting to update log: 
            WID=${workspaceId}, Type=${activityType},
            Criteria=${JSON.stringify(findCriteria)},
            NewDetails=${JSON.stringify(newDetails)}`,
    );

    try {
        const whereClause = {
            workspaceId: workspaceId,
            type: activityType,
            details: {[Op.contains]: findCriteria},
        };

        const logEntry = await WorkspaceActivity.findOne({where: whereClause});

        if (logEntry) {
            const currentDetails =
        typeof logEntry.details === 'object' && logEntry.details !== null ?
            logEntry.details :
            {};
            const updatedDetails = {...currentDetails, ...newDetails};
            await logEntry.update({details: updatedDetails});

            console.log(`Successfully updated activity log entry ID: ${logEntry.id}`);
            return true;
        } else {
            console.warn(`
            Could not find activity log entry to update with criteria: 
                ${JSON.stringify(
        findCriteria,
    )} for WID=${workspaceId}, Type=${activityType}
            `);
            return false;
        }
    } catch (error) {
        console.error(
            `
            Error updating activity log details for WID=${workspaceId},
            Type=${activityType},
            Criteria=${JSON.stringify(findCriteria)}:`,
            error,
        );
        return false;
    }
};

const inviteUser = async (req, res) => {
    const {email, workspaceId} = req.body;
    const inviterUser = req.user;

    try {
        const workspace = await Workspace.findByPk(workspaceId);
        if (!workspace) {
            return res.status(404).json({error: 'Workspace not found'});
        }

        const requestorRole = await WorkspaceTeam.findOne({
            where: {userId: inviterUser.id, workspaceId},
        });
        if (!requestorRole || !['creator', 'admin'].includes(requestorRole.role)) {
            return res
                .status(403)
                .json({
                    error: 'Only workspace admins or the creator can send invites',
                });
        }

        const pendingInvite = await Invite.findOne({
            where: {email, workspaceId, used: false},
        });
        console.log('pendingInvite', pendingInvite);
        if (pendingInvite) {
            return res
                .status(400)
                .json({error: 'User already has a pending invite to this workspace'});
        }

        const existingUser = await User.findOne({where: {email}});
        if (existingUser) {
            const existingMember = await WorkspaceTeam.findOne({
                where: {userId: existingUser.id, workspaceId},
            });
            if (existingMember) {
                return res
                    .status(400)
                    .json({error: 'User is already a member of this workspace'});
            }
        }

        const token = jwt.sign({email, workspaceId}, process.env.JWT_SECRET, {
            expiresIn: '7d',
        });

        const inviteUrl = `${process.env.APP_URL}/accept-invite/${token}`;

        const newInvite = await Invite.create({
            email,
            token,
            workspaceId: workspace.id,
            invitedById: inviterUser.id,
        });

        const activityDetails = {invitedEmail: email, inviteId: newInvite.id};
        if (existingUser) {
            activityDetails.invitedName = `${existingUser.firstName || ''} ${
                existingUser.lastName || ''
            }`.trim();
        } else {
            activityDetails.invitedName = null;
        }

        await logWorkspaceActivity(
            workspaceId,
            inviterUser.id,
            'member_invited',
            activityDetails,
        );

        const inviteeDetails = {email, name: existingUser?.firstName};
        const mailerSendResponse = await emailService.sendWorkspaceInviteEmail(
            inviteeDetails,
            inviterUser,
            workspace,
            inviteUrl,
        );

        if (!mailerSendResponse) {
            console.warn(
                `Failed to send invite email to ${email} via MailerSend, but invite record created.`,
            );
        }

        res.status(201).json({message: 'User invited successfully'});
    } catch (error) {
        console.error('Invite User error:', error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res
                .status(400)
                .json({
                    error: 'Database constraint error (likely duplicate invite attempt).',
                });
        }
        res.status(500).json({error: 'Server error during invitation process'});
    }
};

const acceptInvite = async (req, res) => {
    const {token} = req.body;

    if (!token) {
        return errorResponse(res, 400, 'Invite token is required');
    }

    try {
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return errorResponse(res, 401, 'Invalid or expired invite token');
        }

        const invite = await Invite.findOne({where: {token, used: false}});
        if (!invite) {
            return errorResponse(res, 404, 'Invite not found or already used');
        }

        const {email, workspaceId} = decoded;

        const workspace = await Workspace.findByPk(workspaceId, {
            include: [{model: User, as: 'user', attributes: ['id', 'firstName']}],
        });
        if (!workspace) {
            return errorResponse(res, 404, 'Associated workspace not found');
        }

        let user = await User.findOne({where: {email}});
        let isNewUser = false;
        let originalInvitedLogNeedsUpdate = false;

        if (user) {
            const existingMember = await WorkspaceTeam.findOne({
                where: {userId: user.id, workspaceId: workspace.id},
            });

            if (existingMember) {
                invite.used = true;
                await invite.save();
                return successResponse(res, {
                    success: true,
                    message: 'Already a member of this workspace',
                    isNewUser,
                });
            }
            originalInvitedLogNeedsUpdate = true;
        } else {
            isNewUser = true;
            originalInvitedLogNeedsUpdate = true;
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

        await WorkspaceTeam.create({
            userId: user.id,
            workspaceId: workspace.id,
        });

        invite.used = true;
        await invite.save();

        const joinedActivityDetails = {
            joinedUserId: user.id,
            joinedUserName:
        `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
            joinedUserEmail: user.email,
            invitedByUserId: invite.invitedById,
        };

        await logWorkspaceActivity(
            workspace.id,
            user.id,
            'member_joined',
            joinedActivityDetails,
        );
        if (originalInvitedLogNeedsUpdate) {
            const updatedInviteLogDetails = {
                invitedUserId: user.id,
                invitedUserName:
          `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
            };
            await updateActivityLogDetails(
                workspace.id,
                'member_invited',
                {inviteId: invite.id},
                updatedInviteLogDetails,
            );
        }

        if (workspace.user) {
            acceptInviteNotification(workspace.user.id, workspace, user);
        }

        return successResponse(res, {
            message: 'Invite accepted successfully',
            isNewUser,
        });
    } catch (error) {
        console.error('Accept invite error:', error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            return errorResponse(
                res,
                400,
                'Failed due to data conflict (e.g., username). Please try again or contact support.',
            );
        }
        return errorResponse(
            res,
            500,
            'Failed to accept invite due to server error',
        );
    }
};

export {inviteUser, acceptInvite};
