import {DataTypes, Model} from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Workspace model representing project workspaces
 * @extends Model
 */
class Workspace extends Model {
    /**
     * Convert workspace instance to JSON, adding formatted owner and team information
     * @return {Object} JSON representation of the workspace
     */
    toJSON() {
        const values = {...this.get()};

        // Add owner information
        if (this.user) {
            values.owner = `${this.user.firstName} ${this.user.lastName}`;
        }

        // Add team information
        if (this.team) {
            values.teamMembers = this.team.map((member) => ({
                id: member.id,
                firstName: member.firstName,
                lastName: member.lastName,
                username: member.username,
                email: member.email,
                profilePicture: member.profilePicture,
            }));
        }

        return values;
    }
}

// Define the model
Workspace.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        title: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        slug: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id',
            },
        },
    },
    {
        sequelize,
        modelName: 'Workspace',
        tableName: 'workspaces',
        timestamps: true,
    },
);

export {Workspace};
