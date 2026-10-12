const router = require('express').Router();
const notificationService = require('../services/notificationService');
const { protect } = require('../middlewares/authMiddleware');

router.get('/stream', protect, notificationService.subscribe);

module.exports = router;
