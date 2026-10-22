const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Only ADMIN can access system-wide dashboard stats
router.get('/stats', requireAuth, requireRole('ADMIN'), dashboardController.getStats);

module.exports = router;
