const router = require('express').Router();
const {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  getSessions,
  revokeSession,
  revokeAllSessions,
} = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refreshToken);
router.post('/logout', logout);
router.get('/me', protect, getMe);

// Multi-device session revocation endpoints
router.get('/sessions', protect, getSessions);
router.delete('/sessions/:sessionId', protect, revokeSession);
router.delete('/sessions', protect, revokeAllSessions);

module.exports = router;
