/**
 * Validation and normalisation for task checklists.
 *
 * Checklists arrive as a whole array on every write, so the client never has to
 * reason about item-level endpoints. That makes this the only place item shape
 * is enforced: anything stored here has already been proven well-formed, so
 * readers can trust it without defensive checks.
 */
import {randomUUID} from 'crypto';

export const MAX_CHECKLIST_ITEMS = 100;
export const MAX_ITEM_LENGTH = 500;

/**
 * Validate and normalise a checklist payload.
 *
 * Ids are preserved when supplied and minted when not, so a client can send a
 * brand new item without inventing an id, and reordering never loses identity.
 * @param {*} value - Raw `checklist` from a request body.
 * @return {Object} `{items, error}` — normalised items, or the reason the
 *   payload was rejected.
 */
export const normaliseChecklist = (value) => {
    if (value === null || value === undefined) return {items: [], error: null};
    if (!Array.isArray(value)) {
        return {items: null, error: 'Checklist must be an array'};
    }
    if (value.length > MAX_CHECKLIST_ITEMS) {
        return {items: null, error: `A checklist cannot hold more than ${MAX_CHECKLIST_ITEMS} items`};
    }

    const items = [];
    const seenIds = new Set();

    for (const entry of value) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            return {items: null, error: 'Each checklist item must be an object'};
        }

        const text = typeof entry.text === 'string' ? entry.text.trim() : '';
        if (!text) {
            return {items: null, error: 'Each checklist item needs text'};
        }
        if (text.length > MAX_ITEM_LENGTH) {
            return {items: null, error: `Checklist item text cannot exceed ${MAX_ITEM_LENGTH} characters`};
        }

        // A duplicate id would make two items indistinguishable to the client,
        // so it is treated as a new item rather than silently overwriting.
        let id = typeof entry.id === 'string' && entry.id ? entry.id : randomUUID();
        if (seenIds.has(id)) id = randomUUID();
        seenIds.add(id);

        items.push({id, text, done: entry.done === true});
    }

    return {items, error: null};
};

/**
 * Completion summary for a checklist, for lists that show progress.
 * @param {Array<Object>} checklist - Normalised checklist items.
 * @return {Object} `{total, done}` counts.
 */
export const checklistProgress = (checklist) => {
    if (!Array.isArray(checklist)) return {total: 0, done: 0};
    return {
        total: checklist.length,
        done: checklist.filter((item) => item?.done === true).length,
    };
};
