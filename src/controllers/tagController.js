import Tag from '../models/Tag.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import {Workspace} from '../models/Workspace.js';
import {errorResponse, successResponse} from '../utils/responseUtils.js';
import {getPaginationParams, createPaginatedResponse} from '../utils/pagination.js';
import {Op} from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Get workspace ID from slug
 * @param {string} slug - Workspace slug
 * @return {Promise<string>} - Workspace ID
 * @throws {Object} - Error object with status and message if workspace not found
 */
const getWorkspaceIdFromSlug = async (slug) => {
    const workspace = await Workspace.findOne({where: {slug}, attributes: ['id']});
    if (!workspace) {
        // eslint-disable-next-line no-throw-literal
        throw {status: 404, message: 'Workspace not found'};
    }
    return workspace.id;
};

/**
 * Create a new tag in the workspace
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.workspaceSlug - Workspace slug
 * @param {Object} req.body - Request body
 * @param {string} req.body.name - Tag name
 * @param {string} [req.body.color] - Tag color (hex format)
 * @param {string} [req.body.description] - Tag description
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} Response with created tag or error
 */
export const createTag = async (req, res) => {
    try {
        const {workspaceSlug} = req.params;
        const {name, color, description} = req.body;

        if (!name || name.trim().length === 0) {
            return errorResponse(res, 400, 'Tag name is required');
        }

        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);

        // Check if tag with same name already exists in workspace
        const existingTag = await Tag.findOne({
            where: {
                name: name.trim(),
                workspaceId,
            },
        });

        if (existingTag) {
            return errorResponse(res, 400, 'A tag with this name already exists in the workspace');
        }

        const tag = await Tag.create({
            name: name.trim(),
            color: color || '#3b82f6',
            description: description?.trim() || null,
            workspaceId,
            createdById: req.user.id,
        });

        const populatedTag = await Tag.findByPk(tag.id, {
            include: [{
                model: User,
                as: 'creator',
                attributes: ['id', 'username', 'firstName', 'lastName'],
            }],
        });

        return successResponse(res, {data: populatedTag}, 201);
    } catch (error) {
        console.error('Create Tag Error:', error);
        const statusCode = error.status || 500;
        return errorResponse(res, statusCode, error.message || 'Failed to create tag');
    }
};

/**
 * Get all tags in a workspace with pagination and search
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.workspaceSlug - Workspace slug
 * @param {Object} req.query - Query parameters
 * @param {string} [req.query.search] - Search term for tag names
 * @param {string} [req.query.sortBy] - Sort by field (name, createdAt, taskCount)
 * @param {string} [req.query.sortOrder] - Sort order (ASC or DESC)
 * @param {number} [req.query.page] - Page number for pagination
 * @param {number} [req.query.limit] - Number of items per page
 * @param {Object} res - Express response object
 * @return {Object} Response with paginated tags or error
 */
export const getWorkspaceTags = async (req, res) => {
    try {
        const {workspaceSlug} = req.params;
        const {page, limit, offset} = getPaginationParams(req.query);
        const {search, sortBy = 'name', sortOrder = 'ASC'} = req.query;

        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);

        const whereConditions = {workspaceId};

        if (search) {
            whereConditions.name = {[Op.iLike]: `%${search}%`};
        }

        const validSortFields = ['name', 'createdAt'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'name';
        const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

        const {count, rows: tags} = await Tag.findAndCountAll({
            where: whereConditions,
            include: [
                {
                    model: User,
                    as: 'creator',
                    attributes: ['id', 'username', 'firstName', 'lastName'],
                },
            ],
            attributes: {
                include: [
                    [
                        sequelize.literal('(SELECT COUNT(*) FROM task_tags WHERE task_tags.tag_id = "Tag".id)'),
                        'taskCount',
                    ],
                ],
            },
            limit,
            offset,
            order: [[sortField, order]],
        });

        const response = createPaginatedResponse(tags, count, page, limit);
        return successResponse(res, response);
    } catch (error) {
        console.error('Get Workspace Tags Error:', error);
        const statusCode = error.status || 500;
        return errorResponse(res, statusCode, error.message || 'Failed to fetch workspace tags');
    }
};

/**
 * Get a single tag by ID
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.workspaceSlug - Workspace slug
 * @param {string} req.params.tagId - Tag ID
 * @param {Object} res - Express response object
 * @return {Object} Response with tag data or error
 */
export const getTag = async (req, res) => {
    try {
        const {workspaceSlug, tagId} = req.params;
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);

        const tag = await Tag.findOne({
            where: {
                id: tagId,
                workspaceId,
            },
            include: [
                {
                    model: User,
                    as: 'creator',
                    attributes: ['id', 'username', 'firstName', 'lastName'],
                },
            ],
            attributes: {
                include: [
                    [
                        sequelize.literal('(SELECT COUNT(*) FROM task_tags WHERE task_tags.tag_id = "Tag".id)'),
                        'taskCount',
                    ],
                ],
            },
        });

        if (!tag) {
            return errorResponse(res, 404, 'Tag not found in this workspace');
        }

        return successResponse(res, {data: tag});
    } catch (error) {
        console.error('Get Tag Error:', error);
        const statusCode = error.status || 500;
        return errorResponse(res, statusCode, error.message || 'Failed to fetch tag');
    }
};

/**
 * Update a tag
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.workspaceSlug - Workspace slug
 * @param {string} req.params.tagId - Tag ID
 * @param {Object} req.body - Request body with fields to update
 * @param {string} [req.body.name] - Updated tag name
 * @param {string} [req.body.color] - Updated tag color
 * @param {string} [req.body.description] - Updated tag description
 * @param {Object} res - Express response object
 * @return {Object} Response with updated tag or error
 */
export const updateTag = async (req, res) => {
    try {
        const {workspaceSlug, tagId} = req.params;
        const {name, color, description} = req.body;
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);

        const tag = await Tag.findOne({
            where: {
                id: tagId,
                workspaceId,
            },
        });

        if (!tag) {
            return errorResponse(res, 404, 'Tag not found in this workspace');
        }

        const updateData = {};

        if (name !== undefined) {
            if (!name || name.trim().length === 0) {
                return errorResponse(res, 400, 'Tag name cannot be empty');
            }

            const trimmedName = name.trim();
            if (trimmedName !== tag.name) {
                // Check if another tag with the same name exists
                const existingTag = await Tag.findOne({
                    where: {
                        name: trimmedName,
                        workspaceId,
                        id: {[Op.ne]: tagId},
                    },
                });

                if (existingTag) {
                    return errorResponse(res, 400, 'A tag with this name already exists in the workspace');
                }

                updateData.name = trimmedName;
            }
        }

        if (color !== undefined) {
            updateData.color = color;
        }

        if (description !== undefined) {
            updateData.description = description?.trim() || null;
        }

        if (Object.keys(updateData).length > 0) {
            await tag.update(updateData);
        }

        const updatedTag = await Tag.findByPk(tag.id, {
            include: [
                {
                    model: User,
                    as: 'creator',
                    attributes: ['id', 'username', 'firstName', 'lastName'],
                },
            ],
            attributes: {
                include: [
                    [
                        sequelize.literal('(SELECT COUNT(*) FROM task_tags WHERE task_tags.tag_id = "Tag".id)'),
                        'taskCount',
                    ],
                ],
            },
        });

        return successResponse(res, {data: updatedTag});
    } catch (error) {
        console.error('Update Tag Error:', error);
        const statusCode = error.status || 500;
        return errorResponse(res, statusCode, error.message || 'Failed to update tag');
    }
};

/**
 * Delete a tag
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.workspaceSlug - Workspace slug
 * @param {string} req.params.tagId - Tag ID
 * @param {Object} res - Express response object
 * @return {Object} Response with success message or error
 */
export const deleteTag = async (req, res) => {
    try {
        const {workspaceSlug, tagId} = req.params;
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);

        const tag = await Tag.findOne({
            where: {
                id: tagId,
                workspaceId,
            },
        });

        if (!tag) {
            return errorResponse(res, 404, 'Tag not found in this workspace');
        }

        // Delete the tag (cascade will remove task_tags associations)
        await tag.destroy();

        return successResponse(res, {message: 'Tag deleted successfully'});
    } catch (error) {
        console.error('Delete Tag Error:', error);
        const statusCode = error.status || 500;
        return errorResponse(res, statusCode, error.message || 'Failed to delete tag');
    }
};

/**
 * Get tasks associated with a specific tag
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.workspaceSlug - Workspace slug
 * @param {string} req.params.tagId - Tag ID
 * @param {Object} req.query - Query parameters for pagination
 * @param {Object} res - Express response object
 * @return {Object} Response with paginated tasks or error
 */
export const getTagTasks = async (req, res) => {
    try {
        const {workspaceSlug, tagId} = req.params;
        const {page, limit, offset} = getPaginationParams(req.query);
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);

        // Verify tag exists in workspace
        const tag = await Tag.findOne({
            where: {
                id: tagId,
                workspaceId,
            },
        });

        if (!tag) {
            return errorResponse(res, 404, 'Tag not found in this workspace');
        }

        const {count, rows: tasks} = await Task.findAndCountAll({
            where: {workspaceId},
            include: [
                {
                    model: Tag,
                    as: 'tags',
                    where: {id: tagId},
                    attributes: ['id', 'name', 'color'],
                    through: {attributes: []},
                    required: true,
                },
                {
                    model: User,
                    as: 'assignees',
                    attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
                    through: {attributes: []},
                    required: false,
                },
                {
                    model: User,
                    as: 'creator',
                    attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
                },
            ],
            limit,
            offset,
            order: [['createdAt', 'DESC']],
        });

        const response = createPaginatedResponse(tasks, count, page, limit);
        response.tag = tag;

        return successResponse(res, response);
    } catch (error) {
        console.error('Get Tag Tasks Error:', error);
        const statusCode = error.status || 500;
        return errorResponse(res, statusCode, error.message || 'Failed to fetch tag tasks');
    }
};
