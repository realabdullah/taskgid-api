import {isIP} from 'net';

/*
 * Ranges that must never be a webhook destination: loopback, link-local, and
 * the private blocks. A workspace member choosing a webhook URL is choosing a
 * server-side outbound request target, so an internal address here is SSRF —
 * a way to make the API call something on its own network on the caller's
 * behalf.
 */
const BLOCKED_IPV4_PREFIXES = ['10.', '127.', '169.254.', '192.168.'];
const isBlockedIpv4 = (host) => {
    if (BLOCKED_IPV4_PREFIXES.some((prefix) => host.startsWith(prefix))) return true;
    const octets = host.split('.').map(Number);
    return octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
};

/**
 * Validates a candidate webhook URL.
 *
 * This is a creation-time check against the literal host given, not a
 * delivery-time one — it does not defend against DNS rebinding (a hostname
 * that resolves to a public IP now and a private one at delivery time).
 * @param {string} value - The URL to validate.
 * @return {string|null} An error message, or null when the URL is usable.
 */
export const validateWebhookUrl = (value) => {
    let url;
    try {
        url = new URL(value);
    } catch {
        return 'Webhook URL must be a valid URL';
    }

    if (url.protocol !== 'https:') return 'Webhook URL must use https';

    // Node's URL keeps the brackets on an IPv6 literal host (`[::1]`), which
    // is not a value `net.isIP` recognises.
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost') return 'Webhook URL cannot point at localhost';

    if (isIP(host) === 4 && isBlockedIpv4(host)) {
        return 'Webhook URL cannot point at a private or local address';
    }
    const isBlockedIpv6 = host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80');
    if (isIP(host) === 6 && isBlockedIpv6) {
        return 'Webhook URL cannot point at a private or local address';
    }

    return null;
};
