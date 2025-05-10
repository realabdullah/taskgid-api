import express from 'express';
import {
    addNotification,
    deleteNotification,
    getNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
} from '../controllers/notificationController.js';
import authMiddleware from '../middleware/authMiddleware.js';

// eslint-disable-next-line new-cap
const router = express.Router();

router.get('/:userId', authMiddleware, getNotifications);
router.post('/', authMiddleware, addNotification);
router.put('/:id/read', authMiddleware, markNotificationAsRead);
router.put('/:userId/read-all', authMiddleware, markAllNotificationsAsRead);
router.delete('/:id', authMiddleware, deleteNotification);

export default router;
