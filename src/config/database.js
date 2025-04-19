import {Sequelize} from 'sequelize';
import 'dotenv/config';

// Database configuration
const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'postgres',
        dialectOptions: {
            ssl: {
                rejectUnauthorized: false,
            },
        },
        logging: process.env.NODE_ENV === 'development' ? console.log : false,
        pool: {
            max: 3,
            min: 0,
            acquire: 30000,
            idle: 10000,
        },
        define: {
            timestamps: true,
            underscored: true,
            underscoredAll: true,
            freezeTableName: true,
        },
    },
);

// Test database connection
const testConnection = async () => {
    try {
        await sequelize.authenticate();
        console.log('Database connection established successfully.');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }
};

testConnection();

/**
 * Syncs the database with the models
 * @param {boolean} force - Whether to force the sync (drops all tables)
 * @return {Promise<void>}
 */
export const syncDatabase = async (force = false) => {
    try {
        await sequelize.sync({force});
        console.log('Database synced successfully');
    } catch (error) {
        console.error('Error syncing database:', error);
        throw error;
    }
};

export default sequelize;
