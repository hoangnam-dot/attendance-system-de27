const express = require('express');
const router = express.Router();
const employeeShiftController = require('../controllers/employeeShiftController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Only ADMIN can manage shift assignments
router.use(requireAuth);
router.use(requireRole('ADMIN'));

router.get('/', employeeShiftController.getAll);
router.get('/:id', employeeShiftController.getById);
router.post('/', employeeShiftController.create);
router.put('/:id', employeeShiftController.update);
router.delete('/:id', employeeShiftController.remove);

module.exports = router;
