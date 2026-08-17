import 'dotenv/config';

/**
 * Split a comma-separated env var into trimmed, lowercased, non-empty entries.
 * @param {string} name - The environment variable name
 * @return {string[]} The parsed entries
 */
const parseList = (name) => (process.env[name] || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

/**
 * Exact email addresses allowed to register.
 * Entries without an `@` are ignored -- put domains in ALLOWED_SIGNUP_DOMAINS.
 * @return {Set<string>} The allowed addresses
 */
const allowedEmails = () => new Set(
    parseList('ALLOWED_SIGNUP_EMAILS').filter((entry) => entry.includes('@')),
);

/**
 * Email domains allowed to register.
 * A leading `@` is optional, so both `acme.com` and `@acme.com` work.
 * Matching is exact -- `acme.com` does not cover `mail.acme.com`.
 * @return {Set<string>} The allowed domains
 */
const allowedDomains = () => new Set(
    parseList('ALLOWED_SIGNUP_DOMAINS')
        .map((entry) => (entry.startsWith('@') ? entry.slice(1) : entry))
        .filter(Boolean),
);

/**
 * Whether signup is restricted to an allowlist.
 * When both allowlist vars are unset or empty, signup stays open to everyone.
 * @return {boolean} True when at least one allowlist entry is configured
 */
export const isSignupRestricted = () =>
    allowedEmails().size > 0 || allowedDomains().size > 0;

/**
 * Check an email address against the signup allowlist.
 * @param {string} email - The email address to check
 * @return {boolean} True when the address may register
 */
export const isSignupAllowed = (email) => {
    const emails = allowedEmails();
    const domains = allowedDomains();
    if (emails.size === 0 && domains.size === 0) return true;
    if (!email || typeof email !== 'string') return false;

    const normalized = email.trim().toLowerCase();
    if (emails.has(normalized)) return true;

    const domain = normalized.split('@')[1];
    return Boolean(domain) && domains.has(domain);
};
