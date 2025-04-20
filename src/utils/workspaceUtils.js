import WorkspaceTeam from '../models/WorkspaceTeam.js';

/**
 * Gets the role of a user within a specific workspace.
 * @param {string} userId - The ID of the user.
 * @param {string} workspaceId - The ID of the workspace.
 * @return {Promise<string|null>} The user's role ('creator', 'admin', 'member') or null if not a member.
 */
export const getUserRoleInWorkspace = async (userId, workspaceId) => {
    if (!userId || !workspaceId) {
        return null;
    }
    try {
        const membership = await WorkspaceTeam.findOne({
            where: {userId, workspaceId},
            attributes: ['role'],
        });
        return membership ? membership.role : null;
    } catch (error) {
        console.error(`Error fetching user role for user ${userId} in workspace ${workspaceId}:`, error);
        return null; // Return null on error to prevent accidental access
    }
};
