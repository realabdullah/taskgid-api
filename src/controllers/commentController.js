/* eslint-disable require-jsdoc */
import Comment from '../models/Comment.js';
import User from '../models/User.js';
import {getPaginationParams, createPaginatedResponse} from '../utils/pagination.js';
import 'dotenv/config';

export const getTaskComments = async (req, res) => {
    try {
        const {id} = req.params;
        const {page, limit, offset} = getPaginationParams(req.query);

        const {count, rows: comments} = await Comment.findAndCountAll({
            where: {taskId: id},
            include: [{model: User, as: 'user', attributes: ['username', 'firstName', 'lastName', 'profilePicture']}],
            limit,
            offset,
            order: [['createdAt', 'DESC']],
        });

        if (!comments) throw new Error('No comments found');

        const response = createPaginatedResponse(comments, count, page, limit, 'comments');
        res.json(response);
    } catch (error) {
        res.status(400).json({success: false, error: error.message});
    }
};

export const addTaskComment = async (req, res) => {
    try {
        const comment = await Comment.create({
            ...req.body,
            userId: req.user.id,
        });

        const populatedComment = await Comment.findByPk(comment.id, {
            include: [{model: User, as: 'user', attributes: ['username', 'firstName', 'lastName', 'profilePicture']}],
        });

        res.json({success: true, comment: populatedComment});
    } catch (error) {
        res.status(400).json({success: false, error: error.message});
    }
};
