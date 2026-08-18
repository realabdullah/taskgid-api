'use strict';

const {DataTypes} = require('sequelize');
const {addColumnIfMissing, removeColumnIfPresent} = require('../scripts/migration-helpers.cjs');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface) {
        await addColumnIfMissing(queryInterface, 'users', 'fcm_token', {
            type: DataTypes.STRING,
            allowNull: true,
        });
    },
    async down(queryInterface) {
        await removeColumnIfPresent(queryInterface, 'users', 'fcm_token');
    },
};
