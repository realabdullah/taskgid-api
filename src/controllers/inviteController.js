import crypto from "crypto";
import "dotenv/config";
import jwt from "jsonwebtoken";
import { Op } from "sequelize";
import { NOTIFICATION_TYPES } from "../constants/notificationTypes.js";
import Invite from "../models/Invite.js";
import User from "../models/User.js";
import { Workspace } from "../models/Workspace.js";
import WorkspaceActivity from "../models/WorkspaceActivity.js";
import WorkspaceTeam from "../models/WorkspaceTeam.js";
import notificationService from "../services/notificationService.js";
import { logWorkspaceActivity } from "../utils/activityLogger.js";
import emailService from "../utils/emailService.js";
import {
  createPaginatedResponse,
  getPaginationParams,
} from "../utils/pagination.js";
import { errorResponse, successResponse } from "../utils/responseUtils.js";
import { generateUsername } from "../utils/usernameGenerator.js";

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
      details: { [Op.contains]: findCriteria },
    };

    const logEntry = await WorkspaceActivity.findOne({ where: whereClause });

    if (logEntry) {
      const currentDetails =
        typeof logEntry.details === "object" && logEntry.details !== null
          ? logEntry.details
          : {};
      const updatedDetails = { ...currentDetails, ...newDetails };
      await logEntry.update({ details: updatedDetails });

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

const processSingleInvite = async (email, workspace, inviterUser) => {
  const pendingInvite = await Invite.findOne({
    where: { email, workspaceId: workspace.id, used: false },
  });
  if (pendingInvite) {
    throw new Error(
      `User ${email} already has a pending invite to this workspace`,
    );
  }

  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    const existingMember = await WorkspaceTeam.findOne({
      where: { userId: existingUser.id, workspaceId: workspace.id },
    });
    if (existingMember) {
      throw new Error(`User ${email} is already a member of this workspace`);
    }
  }

  const token = jwt.sign(
    { email, workspaceId: workspace.id },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    },
  );

  const inviteUrl = `${process.env.FRONTEND_URL}/accept-invite/${token}`;

  const newInvite = await Invite.create({
    email,
    token,
    workspaceId: workspace.id,
    invitedById: inviterUser.id,
  });

  const activityDetails = { invitedEmail: email, inviteId: newInvite.id };
  if (existingUser) {
    activityDetails.invitedName = `${existingUser.firstName || ""} ${
      existingUser.lastName || ""
    }`.trim();

    await notificationService.sendNotification(
      existingUser.id,
      NOTIFICATION_TYPES.WORKSPACE_INVITE,
      {
        workspaceId: workspace.id,
        workspaceName: workspace.title,
        inviterId: inviterUser.id,
        inviterName: inviterUser.firstName || inviterUser.username,
      },
    );
  } else {
    activityDetails.invitedName = null;
  }

  await logWorkspaceActivity(
    workspace.id,
    inviterUser.id,
    "member_invited",
    activityDetails,
  );

  const inviteeDetails = { email, name: existingUser?.firstName };
  try {
    await emailService.sendWorkspaceInviteEmail(
      inviteeDetails,
      inviterUser,
      workspace,
      inviteUrl,
    );
  } catch (error) {
    console.warn(
      `Failed to send invite email to ${email}, but invite record created.`,
      error,
    );
  }

  return { success: true, email };
};

const inviteUser = async (req, res) => {
  const { email, workspaceId } = req.body;
  const inviterUser = req.user;

  try {
    const workspace = await Workspace.findByPk(workspaceId);
    if (!workspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    const requestorRole = await WorkspaceTeam.findOne({
      where: { userId: inviterUser.id, workspaceId },
    });
    if (!requestorRole || !["creator", "admin"].includes(requestorRole.role)) {
      return res.status(403).json({
        error: "Only workspace admins or the creator can send invites",
      });
    }

    const result = await processSingleInvite(email, workspace, inviterUser);
    res.status(201).json({ message: "User invited successfully", ...result });
  } catch (error) {
    console.error("Invite User error:", error);
    res
      .status(400)
      .json({ error: error.message || "Failed to send invitation" });
  }
};

const inviteUsersBulk = async (req, res) => {
  const { emails, workspaceId } = req.body;
  const inviterUser = req.user;

  if (!Array.isArray(emails)) {
    return errorResponse(res, 400, "Emails must be an array");
  }

  if (emails.length > 10) {
    return errorResponse(res, 400, "Maximum 10 invitations allowed at a time");
  }

  try {
    const workspace = await Workspace.findByPk(workspaceId);
    if (!workspace) {
      return errorResponse(res, 404, "Workspace not found");
    }

    const requestorRole = await WorkspaceTeam.findOne({
      where: { userId: inviterUser.id, workspaceId },
    });
    if (!requestorRole || !["creator", "admin"].includes(requestorRole.role)) {
      return errorResponse(
        res,
        403,
        "Only workspace admins or the creator can send invites",
      );
    }

    const results = [];
    for (const email of emails) {
      try {
        const result = await processSingleInvite(email, workspace, inviterUser);
        results.push({ email, status: "success", message: "Invite sent" });
      } catch (error) {
        results.push({ email, status: "failed", error: error.message });
      }
    }

    res.status(207).json({
      message: "Bulk invitation process completed",
      results,
    });
  } catch (error) {
    console.error("Bulk Invite Error:", error);
    return errorResponse(res, 500, "Server error during bulk invitation");
  }
};

const acceptInvite = async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return errorResponse(res, 400, "Invite token is required");
  }

  try {
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return errorResponse(res, 401, "Invalid or expired invite token");
    }

    const invite = await Invite.findOne({ where: { token, used: false } });
    if (!invite) {
      return errorResponse(res, 404, "Invite not found or already used");
    }

    const { email, workspaceId } = decoded;

    const workspace = await Workspace.findByPk(workspaceId, {
      attributes: ["id", "name", "userId"],
      include: [{ model: User, as: "user", attributes: ["id", "firstName"] }],
    });
    if (!workspace) {
      return errorResponse(res, 404, "Associated workspace not found");
    }

    let user = await User.findOne({ where: { email } });
    let isNewUser = false;
    let originalInvitedLogNeedsUpdate = false;

    if (user) {
      const existingMember = await WorkspaceTeam.findOne({
        where: { userId: user.id, workspaceId: workspace.id },
      });

      if (existingMember) {
        invite.used = true;
        await invite.save();
        return successResponse(res, {
          success: true,
          message: "Already a member of this workspace",
          isNewUser,
        });
      }
      originalInvitedLogNeedsUpdate = true;
    } else {
      isNewUser = true;
      originalInvitedLogNeedsUpdate = true;
      const tempPassword = crypto.randomBytes(16).toString("hex");
      const generatedUsername = await generateUsername(email);

      user = await User.create({
        email,
        username: generatedUsername,
        password: tempPassword,
        registrationSource: "invite",
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
        `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
      joinedUserEmail: user.email,
      invitedByUserId: invite.invitedById,
    };

    await logWorkspaceActivity(
      workspace.id,
      user.id,
      "member_joined",
      joinedActivityDetails,
    );
    if (originalInvitedLogNeedsUpdate) {
      const updatedInviteLogDetails = {
        invitedUserId: user.id,
        invitedUserName:
          `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
      };
      await updateActivityLogDetails(
        workspace.id,
        "member_invited",
        { inviteId: invite.id },
        updatedInviteLogDetails,
      );
    }

    if (workspace.userId) {
      const joinedUserName =
        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
        user.username ||
        user.email;
      await notificationService.sendNotification(
        workspace.userId,
        NOTIFICATION_TYPES.WORKSPACE_JOINED,
        {
          workspaceId: workspace.id,
          workspaceName: workspace.title,
          userId: user.id,
          userName: joinedUserName,
        },
      );
    } else {
      console.warn(
        `Workspace creator ID not found for workspace ${workspace.id}, ` +
          `cannot send join notification.`,
      );
    }

    let resetToken = null;
    if (isNewUser) {
      resetToken = await user.generateResetPasswordToken();
      await user.save();
    }

    return successResponse(res, {
      message: "Invite accepted successfully",
      isNewUser,
      resetToken,
    });
  } catch (error) {
    console.error("Accept invite error:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return errorResponse(
        res,
        400,
        "Failed due to data conflict (e.g., username). Please try again or contact support.",
      );
    }
    return errorResponse(
      res,
      500,
      "Failed to accept invite due to server error",
    );
  }
};

const getPendingInvitations = async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req);
  const userEmail = req.user.email;

  if (!userEmail) {
    return errorResponse(res, 400, "User email not found in request.");
  }

  try {
    const { count, rows: invites } = await Invite.findAndCountAll({
      where: {
        [Op.and]: [{ email: userEmail }, { used: false }],
      },
      include: [
        {
          model: Workspace,
          as: "workspace",
          attributes: ["title", "description", "slug"],
        },
        {
          model: User,
          as: "invitedBy",
          attributes: [
            "id",
            "firstName",
            "lastName",
            "email",
            "profilePicture",
          ],
        },
      ],
      limit,
      offset,
      order: [["createdAt", "DESC"]],
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
    console.error("Error fetching pending invitations:", error);
    return errorResponse(res, 500, "Failed to fetch pending invitations");
  }
};

const declineInvite = async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return errorResponse(res, 400, "Invite token is required");
  }

  try {
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return errorResponse(res, 401, "Invalid or expired invite token");
    }

    const invite = await Invite.findOne({ where: { token, used: false } });
    if (!invite) {
      return errorResponse(res, 404, "Invite not found or already used");
    }

    const { email, workspaceId } = decoded;

    const workspace = await Workspace.findByPk(workspaceId);
    if (!workspace) {
      return errorResponse(res, 404, "Associated workspace not found");
    }

    invite.used = true;
    await invite.save();

    // Log activity
    await logWorkspaceActivity(
      workspace.id,
      invite.invitedById, // Log against the inviter or system
      "member_invited_declined",
      { invitedEmail: email, inviteId: invite.id },
    );

    // Notify the inviter if the decliner has an account
    const user = await User.findOne({ where: { email } });
    if (user && invite.invitedById) {
      await notificationService.sendNotification(
        invite.invitedById,
        NOTIFICATION_TYPES.WORKSPACE_INVITE_DECLINED,
        {
          workspaceId: workspace.id,
          workspaceName: workspace.title,
          userId: user.id,
          userName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username,
        },
      );
    }

    return successResponse(res, {
      message: "Invite declined successfully",
    });
  } catch (error) {
    console.error("Decline invite error:", error);
    return errorResponse(res, 500, "Failed to decline invite due to server error");
  }
};

export {
  acceptInvite,
  declineInvite,
  getPendingInvitations,
  inviteUser,
  inviteUsersBulk,
};
