/**
 * Hand-written RFC 5545 (iCalendar) generation for the personal task feed.
 *
 * No dependency: the format is a handful of fixed fields, line folding, and
 * value escaping, and pulling in a library for that would be a heavier
 * dependency than the feature itself.
 */

const CRLF = '\r\n';
const FOLD_WIDTH = 75;

/**
 * Escapes a TEXT value per RFC 5545 section 3.3.11.
 * @param {string} value - Raw text.
 * @return {string} Escaped text.
 */
const escapeText = (value) => String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');

/**
 * Folds a content line to 75 octets, continuation lines indented by one space.
 *
 * The limit is octets (UTF-8 bytes), not characters, and a fold may not land
 * inside a multi-byte character. A title with an accent, an emoji, or any
 * non-ASCII script would otherwise be split mid-character and corrupt the
 * feed for exactly the users least likely to be using plain ASCII.
 * @param {string} line - An unfolded "NAME:value" line.
 * @return {string} The folded line, without a trailing CRLF.
 */
const foldLine = (line) => {
    const bytes = Buffer.from(line, 'utf8');
    if (bytes.length <= FOLD_WIDTH) return line;

    const parts = [];
    let offset = 0;
    while (offset < bytes.length) {
        let end = Math.min(offset + FOLD_WIDTH, bytes.length);
        // Continuation bytes are 10xxxxxx; back off until the cut lands on a
        // character boundary.
        while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
        parts.push(bytes.slice(offset, end).toString('utf8'));
        offset = end;
    }
    return parts.join(CRLF + ' ');
};

/**
 * Formats a date as a UTC iCalendar DATE-TIME (YYYYMMDDTHHMMSSZ).
 * @param {Date} date - The instant to format.
 * @return {string} The formatted value.
 */
const formatDateTimeUtc = (date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

/**
 * Builds one VEVENT for a task with a due date.
 * @param {Object} task - A task row with id, title, description, status, dueDate.
 * @param {Object} [options] - Formatting options.
 * @param {string} [options.workspaceTitle] - The task's workspace, for CATEGORIES.
 * @param {string} [options.url] - A link back to the task in the app.
 * @return {string} The VEVENT block, without a trailing CRLF.
 */
const buildEvent = (task, {workspaceTitle, url} = {}) => {
    const start = new Date(task.dueDate);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const summary = task.status === 'done' ? `✓ ${task.title}` : task.title;

    const lines = [
        'BEGIN:VEVENT',
        `UID:${task.id}@taskgid`,
        `DTSTAMP:${formatDateTimeUtc(new Date())}`,
        `DTSTART:${formatDateTimeUtc(start)}`,
        `DTEND:${formatDateTimeUtc(end)}`,
        `SUMMARY:${escapeText(summary)}`,
    ];

    if (task.description) lines.push(`DESCRIPTION:${escapeText(task.description)}`);
    if (url) lines.push(`URL:${url}`);
    if (workspaceTitle) lines.push(`CATEGORIES:${escapeText(workspaceTitle)}`);

    lines.push('END:VEVENT');
    return lines.map(foldLine).join(CRLF);
};

/**
 * Builds a full VCALENDAR feed of one user's tasks with a due date.
 * @param {Array<Object>} tasks - Tasks with id, title, description, status,
 *   dueDate, and an optional `workspace` (`{title, slug}`).
 * @param {Object} [options] - Feed-level options.
 * @param {string} [options.calendarName] - X-WR-CALNAME value.
 * @param {Function} [options.taskUrl] - `(taskId, workspaceSlug) => string`,
 *   building the URL for one task.
 * @return {string} The complete .ics document, CRLF-terminated.
 */
export const buildCalendarFeed = (tasks, {calendarName = 'Taskgid', taskUrl} = {}) => {
    const header = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Taskgid//Calendar Feed//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${escapeText(calendarName)}`,
    ].map(foldLine);

    const events = tasks
        .filter((task) => task.dueDate)
        .map((task) => buildEvent(task, {
            workspaceTitle: task.workspace?.title,
            url: taskUrl ? taskUrl(task.id, task.workspace?.slug) : undefined,
        }));

    return [...header, ...events, 'END:VCALENDAR'].join(CRLF) + CRLF;
};
