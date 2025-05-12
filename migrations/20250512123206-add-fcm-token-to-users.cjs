'use strict';

const {DataTypes} = require('sequelize');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('users', 'fcm_token', {
            type: DataTypes.STRING,
            allowNull: true,
        });
    },
    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('users', 'fcm_token');
    },
};
