const router = require('express').Router();
const { getAnalytics } = require('../controllers/adminAnalyticsController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

router.use(protect, authorize('admin'));

router.get('/analytics', getAnalytics);

module.exports = router;
