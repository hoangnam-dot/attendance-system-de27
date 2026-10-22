const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Only ADMIN can access system-wide attendance management
router.use(requireAuth);
router.use(requireRole('ADMIN'));

router.get('/', attendanceController.getAll);
router.get('/today', attendanceController.getTodayActive);
router.post('/check-in', attendanceController.checkIn);
router.post('/check-out', attendanceController.checkOut);

module.exports = router;
