const express = require('express');
const router = express.Router();
const employeePortalController = require('../controllers/employeePortalController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Only EMPLOYEE can access personal employee portal endpoints
router.use(requireAuth);
router.use(requireRole('EMPLOYEE'));

router.get('/profile', employeePortalController.getProfile);
router.get('/today-shift', employeePortalController.getTodayShift);
router.get('/today-attendance', employeePortalController.getTodayAttendance);
router.post('/check-in', employeePortalController.selfCheckIn);
router.post('/check-out', employeePortalController.selfCheckOut);
router.get('/history', employeePortalController.getSelfHistory);

module.exports = router;
