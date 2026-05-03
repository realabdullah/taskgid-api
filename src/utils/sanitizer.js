import sanitizeHtml from 'sanitize-html';

/**
 * Strips all HTML tags, leaving only plain text.
 * Suitable for titles, short text fields, etc.
 * @param {string} dirty - The dirty input string
 * @return {string} The sanitized plain text
 */
export const sanitizePlainText = (dirty) => {
    if (!dirty || typeof dirty !== 'string') return dirty;
    return sanitizeHtml(dirty, {
        allowedTags: [],
        allowedAttributes: {},
    });
};

/**
 * Sanitizes rich text, allowing safe HTML tags for formatting.
 * Suitable for descriptions, comments, etc.
 * @param {string} dirty - The dirty input string
 * @return {string} The sanitized HTML string
 */
export const sanitizeRichText = (dirty) => {
    if (!dirty || typeof dirty !== 'string') return dirty;
    return sanitizeHtml(dirty, {
        allowedTags: [
            'b', 'i', 'em', 'strong', 'a', 'p', 'br',
            'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'blockquote', 'code', 'pre', 'hr', 'div', 'span',
            'u', 's', 'strike',
        ],
        allowedAttributes: {
            'a': ['href', 'target', 'rel'],
            'div': ['class', 'style'],
            'span': ['class', 'style'],
            'p': ['class', 'style'],
            'ul': ['class'],
            'ol': ['class'],
            'li': ['class'],
        },
        allowedStyles: {
            '*': {
                'color': [/^\#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/],
                'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
                'font-size': [/^\d+(?:px|em|%)$/],
            },
        },
        // Transform absolute URLs to be safe if needed, or enforce target="_blank"
        transformTags: {
            'a': sanitizeHtml.simpleTransform('a', {target: '_blank', rel: 'noopener noreferrer'}),
        },
    });
};

export default {
    sanitizePlainText,
    sanitizeRichText,
};
