'use strict';

/**
 * Helpers for migrations that must survive a drifted schema.
 *
 * This database was built by `sequelize.sync()` before it was managed by
 * migrations, so tables and columns often already exist by the time the
 * migration that "creates" them runs. A blind addColumn/createTable throws in
 * that case and stops the whole run, which is why `db:migrate` could not get
 * past the second file.
 *
 * These check first, so one migration set works against a fresh database, a
 * sync()-built one, and anything in between.
 */

/**
 * Whether a table exists in the current schema.
 * @param {Object} queryInterface - Sequelize query interface.
 * @param {string} table - Table name.
 * @return {Promise<boolean>} True when present.
 */
const tableExists = async (queryInterface, table) => {
    const [rows] = await queryInterface.sequelize.query(
        `SELECT to_regclass('public.${table}') IS NOT NULL AS present;`,
    );
    return Boolean(rows[0]?.present);
};

/**
 * Whether a column exists on a table.
 * @param {Object} queryInterface - Sequelize query interface.
 * @param {string} table - Table name.
 * @param {string} column - Column name.
 * @return {Promise<boolean>} True when present.
 */
const columnExists = async (queryInterface, table, column) => {
    const [rows] = await queryInterface.sequelize.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = :table AND column_name = :column
          LIMIT 1;`,
        {replacements: {table, column}},
    );
    return rows.length > 0;
};

/**
 * Whether an index exists by name.
 * @param {Object} queryInterface - Sequelize query interface.
 * @param {string} name - Index name.
 * @return {Promise<boolean>} True when present.
 */
const indexExists = async (queryInterface, name) => {
    const [rows] = await queryInterface.sequelize.query(
        `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = :name LIMIT 1;`,
        {replacements: {name}},
    );
    return rows.length > 0;
};

/**
 * Adds a column only when it is missing.
 * @param {Object} queryInterface - Sequelize query interface.
 * @param {string} table - Table name.
 * @param {string} column - Column name.
 * @param {Object} definition - Sequelize column definition.
 * @return {Promise<void>} Resolves when applied or skipped.
 */
const addColumnIfMissing = async (queryInterface, table, column, definition) => {
    if (await columnExists(queryInterface, table, column)) {
        console.log(`  skip: ${table}.${column} already exists`);
        return;
    }
    await queryInterface.addColumn(table, column, definition);
};

/**
 * Removes a column only when it is present.
 * @param {Object} queryInterface - Sequelize query interface.
 * @param {string} table - Table name.
 * @param {string} column - Column name.
 * @return {Promise<void>} Resolves when applied or skipped.
 */
const removeColumnIfPresent = async (queryInterface, table, column) => {
    if (!(await columnExists(queryInterface, table, column))) return;
    await queryInterface.removeColumn(table, column);
};

/**
 * Creates a table only when it is missing.
 * @param {Object} queryInterface - Sequelize query interface.
 * @param {string} table - Table name.
 * @param {Object} definition - Sequelize table definition.
 * @return {Promise<void>} Resolves when applied or skipped.
 */
const createTableIfMissing = async (queryInterface, table, definition) => {
    if (await tableExists(queryInterface, table)) {
        console.log(`  skip: table ${table} already exists`);
        return;
    }
    await queryInterface.createTable(table, definition);
};

/**
 * Adds a named index only when it is missing.
 * @param {Object} queryInterface - Sequelize query interface.
 * @param {string} table - Table name.
 * @param {Array<string>} fields - Indexed columns.
 * @param {Object} options - Sequelize index options; `name` is required.
 * @return {Promise<void>} Resolves when applied or skipped.
 */
const addIndexIfMissing = async (queryInterface, table, fields, options) => {
    if (await indexExists(queryInterface, options.name)) {
        console.log(`  skip: index ${options.name} already exists`);
        return;
    }
    await queryInterface.addIndex(table, fields, options);
};

module.exports = {
    addColumnIfMissing,
    addIndexIfMissing,
    columnExists,
    createTableIfMissing,
    indexExists,
    removeColumnIfPresent,
    tableExists,
};
