/**
 * Invokes an Express-style controller without an HTTP hop, capturing the
 * JSON body it would have written. Used by the MCP tools so they share the
 * same code path as the public REST routes.
 * @param {Function} handler - `(req, res) => …` controller.
 * @param {Object} parts - Fake request pieces.
 * @param {Object} parts.user - Authenticated user, as `authMiddleware` sets.
 * @param {Object} [parts.apiKey] - Active API key, when one authenticated the call.
 * @param {Object} [parts.params] - Route params.
 * @param {Object} [parts.query] - Query string.
 * @param {Object} [parts.body] - JSON body.
 * @return {Promise<{status: number, body: Object}>} The status and JSON payload.
 */
export const invokeHandler = (handler, parts) => {
    const {user, apiKey = null, params = {}, query = {}, body = {}} = parts;

    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (status, payload) => {
            if (settled) return;
            settled = true;
            resolve({status, body: payload});
        };

        const req = {
            user,
            apiKey,
            apiKeyWorkspaceId: apiKey?.workspaceId,
            params,
            query,
            body,
            headers: {},
        };

        const res = {
            statusCode: 200,
            headersSent: false,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(payload) {
                this.headersSent = true;
                finish(this.statusCode, payload);
                return this;
            },
            send(payload) {
                this.headersSent = true;
                finish(this.statusCode, typeof payload === 'string' ? {message: payload} : payload);
                return this;
            },
        };

        Promise.resolve(handler(req, res)).catch((err) => {
            if (!settled) reject(err);
        });
    });
};
