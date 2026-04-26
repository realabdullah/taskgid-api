import "dotenv/config";
import pg from "pg";
import { Sequelize } from "sequelize";

// Database configuration
const sequelize = process.env.DATABASE_URL
    ? new Sequelize(process.env.DATABASE_URL, {
        dialect: 'postgres',
        dialectModule: pg,
        dialectOptions: {
            ssl: {
                rejectUnauthorized: false,
            },
            connectionTimeoutMillis: 30000,
            keepAlive: true,
        },
        logging: process.env.NODE_ENV === 'development' ? console.log : false,
        pool: {
            max: 5,
            min: 0,
            acquire: 60000,
            idle: 10000,
        },
        define: {
            timestamps: true,
            underscored: true,
            underscoredAll: true,
            freezeTableName: true,
        },
    })
    : new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER,
        process.env.DB_PASSWORD,
        {
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            dialect: 'postgres',
            dialectModule: pg,
            dialectOptions: {
                ssl: process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production' ? {
                    rejectUnauthorized: false,
                } : false,
                connectionTimeoutMillis: 30000,
                keepAlive: true,
            },
            logging: process.env.NODE_ENV === 'development' ? console.log : false,
            pool: {
                max: 5,
                min: 0,
                acquire: 60000,
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
    console.log("Database connection established successfully.");
  } catch (error) {
    console.error("Unable to connect to the database:", error);
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
    await sequelize.sync({ force });
    console.log("Database synced successfully");
  } catch (error) {
    console.error("Error syncing database:", error);
    throw error;
  }
};

export default sequelize;
