/**
 * Server-rendered consent pages for the MCP OAuth authorization code flow.
 * Kept plain HTML so Claude.ai (and any other browser-based client) can complete
 * the grant without depending on the Taskgid SPA being reachable.
 */

/**
 * Escapes text for safe inclusion in HTML.
 * @param {unknown} value - Raw value.
 * @return {string} Escaped string.
 */
const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const STYLES = `
:root {
  color-scheme: light dark;
  --bg: #0f1115;
  --card: #181b22;
  --text: #e8eaed;
  --muted: #9aa0a6;
  --border: #2a2f3a;
  --accent: #6c8cff;
  --danger: #f07178;
  --input: #0c0e12;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #f4f5f7;
    --card: #fff;
    --text: #1a1d23;
    --muted: #5f6368;
    --border: #e2e5eb;
    --accent: #3b5bdb;
    --danger: #c92a2a;
    --input: #fff;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font: 15px/1.5 system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  padding: 24px;
}
main {
  width: min(420px, 100%);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 28px 24px;
  box-shadow: 0 12px 40px rgb(0 0 0 / 18%);
}
h1 {
  font-size: 1.25rem;
  margin: 0 0 6px;
  letter-spacing: -0.02em;
}
p { margin: 0 0 16px; color: var(--muted); }
label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  margin: 0 0 6px;
}
input, select {
  width: 100%;
  height: 40px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--input);
  color: var(--text);
  padding: 0 12px;
  margin-bottom: 14px;
  font: inherit;
}
input:focus, select:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
button {
  width: 100%;
  height: 42px;
  border: 0;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
button:hover { filter: brightness(1.05); }
.error {
  background: color-mix(in srgb, var(--danger) 14%, transparent);
  color: var(--danger);
  border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 14px;
  font-size: 0.9rem;
}
.brand {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 14px;
}
.meta { font-size: 0.8rem; color: var(--muted); margin-top: 16px; }
`.trim();

/**
 * Shared page chrome.
 * @param {Object} opts - Page options.
 * @param {string} opts.title - Document title.
 * @param {string} opts.body - Inner HTML.
 * @return {string} Full HTML document.
 */
const page = ({title, body}) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)} · Taskgid</title>
<style>
${STYLES}
</style>
</head>
<body>
<main>
  <div class="brand">Taskgid · MCP</div>
  ${body}
</main>
</body>
</html>`;

/**
 * Login step: email + password.
 * @param {Object} [opts] - Options.
 * @param {string} [opts.error] - Error message.
 * @param {string} [opts.clientName] - Client display name.
 * @return {string} HTML.
 */
export const renderLoginPage = ({error, clientName} = {}) => {
    const who = clientName ?
        `<strong>${esc(clientName)}</strong> wants` :
        'A client wants';
    return page({
        title: 'Sign in',
        body: `
      <h1>Connect an MCP client</h1>
      <p>${who} access to act as you inside one workspace.</p>
      ${error ? `<div class="error">${esc(error)}</div>` : ''}
      <form method="post" action="/mcp/oauth/consent">
        <input type="hidden" name="step" value="login"/>
        <label for="email">Email</label>
        <input id="email" name="email" type="email"
          autocomplete="username" required autofocus/>
        <label for="password">Password</label>
        <input id="password" name="password" type="password"
          autocomplete="current-password" required/>
        <button type="submit">Continue</button>
      </form>
      <p class="meta">You will pick which workspace the client can use next.</p>
    `,
    });
};

/**
 * Workspace picker after a successful login.
 * @param {Object} opts - Options.
 * @param {Array<{id: string, title: string, slug: string}>} opts.workspaces
 *   Choices.
 * @param {string} opts.session - Signed consent session token.
 * @param {string} [opts.error] - Error message.
 * @param {string} [opts.clientName] - Client display name.
 * @param {string} [opts.userLabel] - Signed-in user label.
 * @return {string} HTML.
 */
export const renderWorkspacePage = ({
    workspaces,
    session,
    error,
    clientName,
    userLabel,
} = {}) => {
    if (!workspaces?.length) {
        return page({
            title: 'No workspaces',
            body: `
              <h1>No workspaces available</h1>
              <p>Sign in to Taskgid and join or create a workspace, then start
              the connection again from your MCP client.</p>
            `,
        });
    }

    const options = workspaces.map((w) =>
        `<option value="${esc(w.id)}">${esc(w.title)} (${esc(w.slug)})</option>`,
    ).join('');

    const actor = clientName ?
        `<strong>${esc(clientName)}</strong> will` :
        'The client will';
    const asWho = esc(userLabel || 'you');

    return page({
        title: 'Choose workspace',
        body: `
          <h1>Choose a workspace</h1>
          <p>${actor} act as ${asWho} inside the workspace you pick.
          Agent actions are labeled as coming from an agent.</p>
          ${error ? `<div class="error">${esc(error)}</div>` : ''}
          <form method="post" action="/mcp/oauth/consent">
            <input type="hidden" name="step" value="approve"/>
            <input type="hidden" name="session" value="${esc(session)}"/>
            <label for="workspaceId">Workspace</label>
            <select id="workspaceId" name="workspaceId" required>
              ${options}
            </select>
            <button type="submit">Allow access</button>
          </form>
          <p class="meta">You can revoke access later by rotating credentials
          or disconnecting the client.</p>
        `,
    });
};

/**
 * Generic error page when the pending cookie is missing.
 * @param {string} message - Error text.
 * @return {string} HTML.
 */
export const renderErrorPage = (message) => page({
    title: 'Authorization error',
    body: `
      <h1>Cannot continue</h1>
      <p>${esc(message)}</p>
      <p class="meta">Close this tab and start the connection again from your
      MCP client.</p>
    `,
});
