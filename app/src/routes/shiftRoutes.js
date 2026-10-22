const express = require('express');
const router = express.Router();
const shiftController = require('../controllers/shiftController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Only ADMIN can access shift management
router.use(requireAuth);
router.use(requireRole('ADMIN'));

router.get('/', shiftController.getAll);
router.get('/:id', shiftController.getById);
router.post('/', shiftController.create);
router.put('/:id', shiftController.update);
router.delete('/:id', shiftController.remove);

module.exports = router;
