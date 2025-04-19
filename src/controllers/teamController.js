import {Workspace} from '../models/Workspace.js';
import User from '../models/User.js';
import 'dotenv/config';

export const getWorkspaceTeam = async (req, res) => {
    try {
        const {slug} = req.params;
        const workspace = await Workspace.findOne({
            where: {slug},
            include: [{
                model: User,
                as: 'team',
                attributes: ['firstName', 'lastName', 'username', 'email', 'profilePicture'],
            }],
        });

        if (!workspace) {
            return res.status(404).json({error: 'Workspace not found'});
        }

        res.json({success: true, team: workspace.team});
    } catch (error) {
        res.status(400).json({success: false, error: error.message});
    }
};
