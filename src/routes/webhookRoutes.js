import express from 'express';
import {
    listWebhookEndpoints,
    createWebhookEndpoint,
    updateWebhookEndpoint,
    rotateWebhookSecret,
    deleteWebhookEndpoint,
    listWebhookDeliveries,
} from '../controllers/webhookController.js';
import {validateWebhookEndpointCreate, validateWebhookEndpointUpdate} from '../middleware/validationMiddleware.js';

// eslint-disable-next-line new-cap
const router = express.Router({mergeParams: true});

router.get('/', listWebhookEndpoints);
router.post('/', validateWebhookEndpointCreate, createWebhookEndpoint);
router.patch('/:id', validateWebhookEndpointUpdate, updateWebhookEndpoint);
router.post('/:id/rotate-secret', rotateWebhookSecret);
router.delete('/:id', deleteWebhookEndpoint);
router.get('/:id/deliveries', listWebhookDeliveries);

export default router;
