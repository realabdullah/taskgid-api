/* eslint-disable require-jsdoc */
import Invite from '../models/Invite.js';
import {Workspace} from '../models/Workspace.js';
import User from '../models/User.js';
import {getPaginationParams, createPaginatedResponse} from '../utils/pagination.js';
import {Op} from 'sequelize';

// Helper for standardized error responses
const errorResponse = (res, status, message) => res.status(status).json({error: message, success: false});

export const getPendingInvitations = async (req, res) => {
    const {page, limit, offset} = getPaginationParams(req);
    // Use email from authenticated user to find invites
    const userEmail = req.user.email;

    if (!userEmail) {
        // Handle case where user email is not available (shouldn't happen with authMiddleware)
        return errorResponse(res, 400, 'User email not found in request.');
    }

    try {
        const {count, rows: invites} = await Invite.findAndCountAll({
            where: {
                // Combine all conditions explicitly with Op.and
                [Op.and]: [
                    {email: userEmail},
                    {used: false},
                    // Force query to use the camelCase column name 'expiresAt'
                    // Sequelize.where(Sequelize.col('expiresAt'), Op.gt, new Date()),
                ],
            },
            include: [
                {
                    model: Workspace,
                    as: 'workspace', // Ensure this association alias is correct in Invite model
                    attributes: ['title', 'description', 'slug'], // Added slug for potential linking
                },
                {
                    model: User,
                    as: 'invitedBy',
                    attributes: ['id', 'firstName', 'lastName', 'email', 'profilePicture'],
                },
            ],
            limit,
            offset,
            order: [['createdAt', 'DESC']],
            distinct: true,
        });

        // Format the response
        const formattedInvites = invites.map((inv) => ({
            invitationId: inv.id,
            token: inv.token, // Include token if needed for accept/reject actions
            workspaceTitle: inv.workspace?.title, // Use optional chaining for safety
            workspaceDescription: inv.workspace?.description,
            workspaceSlug: inv.workspace?.slug,
            invitedBy: inv.invitedBy, // User object of the inviter
            // Role is not available on the Invite model itself
            invitedAt: inv.createdAt,
            // expiresAt: inv.expiresAt,
        }));

        res.json(createPaginatedResponse(formattedInvites, count, page, limit));
    } catch (error) {
        console.error('Error fetching pending invitations:', error);
        return errorResponse(res, 500, 'Failed to fetch pending invitations');
    }
};

// Placeholder for other invitation actions (accept, reject, etc.)
// These would likely use the invite token
// export const acceptInvitation = async (req, res) => { ... };
// export const rejectInvitation = async (req, res) => { ... };
