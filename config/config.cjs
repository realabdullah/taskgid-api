// A .cjs file cannot use ESM import syntax; this is loaded by sequelize-cli.
require('dotenv/config');

/**
 * Database settings for sequelize-cli. Mirrors src/config/database.js: a
 * DATABASE_URL wins when present, otherwise the discrete DB_* variables.
 */
const fromParts = {
    username: process.env.DB_USER || 'postgres',
    // The app reads DB_PASSWORD; DB_PASS is kept as a fallback for older setups.
    password: process.env.DB_PASSWORD || process.env.DB_PASS || null,
    database: process.env.DB_NAME || 'your_db_name',
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    dialectOptions:
        process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production' ?
            {ssl: {require: true, rejectUnauthorized: false}} :
            {},
};

const config = process.env.DATABASE_URL ?
    {
        use_env_variable: 'DATABASE_URL',
        dialect: 'postgres',
        dialectOptions: {ssl: {require: true, rejectUnauthorized: false}},
    } :
    fromParts;

module.exports = {
    development: config,
    test: config,
    production: config,
};
