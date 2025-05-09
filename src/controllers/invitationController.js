/* eslint-disable require-jsdoc */
import Invite from '../models/Invite.js';
import {Workspace} from '../models/Workspace.js';
import User from '../models/User.js';
import {getPaginationParams, createPaginatedResponse} from '../utils/pagination.js';
import {errorResponse} from '../utils/responseUtils.js';
import {Op} from 'sequelize';

export const getPendingInvitations = async (req, res) => {
    const {page, limit, offset} = getPaginationParams(req);
    const userEmail = req.user.email;

    if (!userEmail) {
        return errorResponse(res, 400, 'User email not found in request.');
    }

    try {
        const {count, rows: invites} = await Invite.findAndCountAll({
            where: {
                [Op.and]: [
                    {email: userEmail},
                    {used: false},
                ],
            },
            include: [
                {
                    model: Workspace,
                    as: 'workspace',
                    attributes: ['title', 'description', 'slug'],
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

        const formattedInvites = invites.map((inv) => ({
            invitationId: inv.id,
            token: inv.token,
            workspaceTitle: inv.workspace?.title,
            workspaceDescription: inv.workspace?.description,
            workspaceSlug: inv.workspace?.slug,
            invitedBy: inv.invitedBy,
            invitedAt: inv.createdAt,
        }));

        res.json(createPaginatedResponse(formattedInvites, count, page, limit));
    } catch (error) {
        console.error('Error fetching pending invitations:', error);
        return errorResponse(res, 500, 'Failed to fetch pending invitations');
    }
};

