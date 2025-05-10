import {NOTIFICATION_DATA} from '../constants/notificationTypes.js';

/**
 * Validates notification data against required fields
 * @param {string} type - The notification type
 * @param {object} data - The notification data to validate
 * @return {object} Validation result with isValid and errors
 */
export const validateNotificationData = (type, data) => {
    const notificationType = NOTIFICATION_DATA[type];
    if (!notificationType) {
        return {
            isValid: false,
            errors: [`Invalid notification type: ${type}`],
        };
    }

    const {requiredFields} = notificationType;
    const errors = [];

    // Check for required fields
    requiredFields.forEach((field) => {
        if (!data[field]) {
            errors.push(`Missing required field: ${field}`);
        }
    });

    // Validate title and message
    if (!data.title) {
        data.title = notificationType.title;
    }
    if (!data.message) {
        data.message = notificationType.message;
    }

    return {
        isValid: errors.length === 0,
        errors,
        data: {
            ...data,
            title: data.title,
            message: data.message,
        },
    };
};
