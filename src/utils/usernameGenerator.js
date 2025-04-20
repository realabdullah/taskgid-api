import User from '../models/User.js';

/**
 * Generates a unique username based on email.
 * @param {string} email - The user's email address.
 * @param {number} [maxLength=30] - Maximum length for the username.
 * @return {Promise<string>} A unique username.
 */
export const generateUsername = async (email, maxLength = 30) => {
    // Extract the part before the '@'
    let baseUsername = email.split('@')[0];

    // Remove non-alphanumeric characters
    baseUsername = baseUsername.replace(/[^a-zA-Z0-9]/g, '');

    // Ensure baseUsername is not empty after cleaning
    if (!baseUsername) {
        baseUsername = 'user';
    }

    // Truncate if too long initially
    baseUsername = baseUsername.substring(0, maxLength);

    let username = baseUsername;
    let counter = 1;

    // Check for uniqueness and append counter/random chars if needed
    while (await User.findOne({where: {username}})) {
        const suffix = Math.random().toString(36).substring(2, 8); // Add random chars for better uniqueness
        const baseLength = maxLength - suffix.length - 1; // -1 for potential underscore/separator

        // Ensure base username isn't truncated too much
        const truncatedBase = baseUsername.substring(0, baseLength);

        username = `${truncatedBase}_${suffix}`;

        // Fallback if somehow still conflicting or too long (highly unlikely)
        if (username.length > maxLength || counter > 10) { // Safety break
            username = `user_${Date.now().toString(36)}`;
            break;
        }
        counter++;
    }

    return username.substring(0, maxLength); // Final length check
};
