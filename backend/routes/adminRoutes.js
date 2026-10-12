const router = require('express').Router();
const { getAnalytics } = require('../controllers/adminAnalyticsController');
const { getAuditLogs } = require('../controllers/auditLogController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

router.use(protect, authorize('admin'));

router.get('/analytics', getAnalytics);
router.get('/audit-logs', getAuditLogs);

module.exports = router;
