/* eslint-disable require-jsdoc */
import Workspace from '../models/workspaceModel.js';
import User from '../models/userModel.js';

export const getWorkspaces = async (req, res) => {
    try {
        const workspaces = await Workspace.find({team: req.user._id})
            .populate('user', 'firstName lastName')
            .populate('team', 'firstName lastName username profile_picture email');
        res.send({success: true, workspaces});
    } catch (error) {
        res.status(500).json({error: error.message, success: false});
    }
};

export const getWorkspace = async (req, res) => {
    try {
        const workspace = await Workspace.findOne({
            user: req.user._id,
            slug: req.params.slug,
        })
            .populate('user', 'firstName lastName')
            .populate('team', 'firstName lastName username profile_picture email');
        if (!workspace) {
            return res.status(404).json({error: 'Workspace not found', success: false});
        }
        res.json({success: true, workspace});
    } catch (error) {
        res.status(500).json({error: error.message, success: false});
    }
};

const getUserIds = async (team) => {
    const userIds = [];

    for (const member of team) {
        const user = await User.findOne({email: member.email});
        if (user) userIds.push(user._id);
    }

    return userIds;
};

export const updateWorkspace = async (req, res) => {
    try {
        const payload = req.body;
        const userIds = await getUserIds(payload.team);
        payload.team = userIds;

        if (payload.slug !== req.params.slug) {
            const slugExists = await checkIfSlugExists(payload.slug);
            if (slugExists) {
                return res.status(400).json({error: 'A workspace with this slug already exists', success: false});
            }
        }

        const workspace = await Workspace.findOneAndUpdate({
            user: req.user._id,
            slug: req.params.slug,
        }, payload, {new: true})
            .populate('user', 'firstName lastName')
            .populate('team', 'firstName lastName username profile_picture email');
        if (!workspace) {
            return res.status(404).json({error: 'Workspace not found', success: false});
        }
        res.json({success: true, workspace});
    } catch (error) {
        res.status(500).json({error: error.message, success: false});
    }
};

export const deleteWorkspace = async (req, res) => {
    try {
        const workspace = await Workspace.findOneAndDelete({
            user: req.user._id,
            slug: req.params.slug,
        });
        if (!workspace) {
            return res.status(404).json({error: 'Workspace not found', success: false});
        }
        res.json({success: true});
    } catch (error) {
        res.status(500).json({error: error.message, success: false});
    }
};

export const addNewWorkspace = async (req, res) => {
    try {
        const workspace = (await createWorkspace({...req.body, user: req.user._id}));
        const populatedWorkspace = await Workspace.findOne({_id: workspace._id})
            .populate('user', 'firstName lastName')
            .populate('team', 'firstName lastName username profile_picture email');
        res.json({success: true, workspace: populatedWorkspace});
    } catch (error) {
        res.status(500).json({error: error.message, success: false});
    }
};

const checkIfSlugExists = async (slug) => {
    const count = await Workspace.countDocuments({slug});
    return count > 0;
};

export const createWorkspace = async (payload, usage = 'create') => {
    const {slug} = payload;
    const slugExists = await checkIfSlugExists(slug);
    if (slugExists && usage === 'create') {
        throw new Error('A workspace with this slug already exists');
    } else if (slugExists && usage === 'new-user') {
        let newSlug = Math.random().toString(36).substring(2, 10);
        while (await checkIfSlugExists(newSlug)) {
            newSlug = Math.random().toString(36).substring(2, 10);
        }
        payload.slug = newSlug;
    }

    const workspace = new Workspace(payload);
    const savedWorkspace = await workspace.save();
    return savedWorkspace;
};
