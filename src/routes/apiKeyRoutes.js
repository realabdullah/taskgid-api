import express from 'express';
import {listApiKeys, createApiKey, revokeApiKey} from '../controllers/apiKeyController.js';

// eslint-disable-next-line new-cap
const router = express.Router({mergeParams: true});

router.get('/', listApiKeys);
router.post('/', createApiKey);
router.delete('/:id', revokeApiKey);

export default router;
