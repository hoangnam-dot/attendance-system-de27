const { pool } = require('../config/db');

async function getAll(req, res) {
  try {
    const { date, employee_id } = req.query;
    let query = `
      SELECT 
        es.id,
        es.employee_id,
        es.shift_id,
        DATE_FORMAT(es.work_date, '%Y-%m-%d') AS work_date,
        DATE_FORMAT(es.created_at, '%Y-%m-%d %H:%i') AS created_at,
        e.employee_code,
        e.full_name,
        e.department,
        s.shift_name,
        TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
        TIME_FORMAT(s.end_time, '%H:%i') AS end_time
      FROM employee_shifts es
      JOIN employees e ON es.employee_id = e.id
      JOIN shifts s ON es.shift_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (date && date.trim() !== '') {
      query += ' AND es.work_date = ?';
      params.push(date.trim());
    }

    if (employee_id && employee_id.trim() !== '') {
      query += ' AND es.employee_id = ?';
      params.push(parseInt(employee_id, 10));
    }

    query += ' ORDER BY es.work_date DESC, es.id DESC';

    const [rows] = await pool.execute(query, params);
    return res.json({
      success: true,
      data: rows
    });
  } catch (err) {
    console.error('getEmployeeShifts error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi tải danh sách phân ca: ' + err.message
    });
  }
}

async function getById(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(`
      SELECT 
        es.id,
        es.employee_id,
        es.shift_id,
        DATE_FORMAT(es.work_date, '%Y-%m-%d') AS work_date,
        e.employee_code,
        e.full_name,
        s.shift_name
      FROM employee_shifts es
      JOIN employees e ON es.employee_id = e.id
      JOIN shifts s ON es.shift_id = s.id
      WHERE es.id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông tin phân ca'
      });
    }

    return res.json({
      success: true,
      data: rows[0]
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ: ' + err.message
    });
  }
}

async function create(req, res) {
  try {
    const { employee_id, shift_id, work_date } = req.body;

    if (!employee_id || !shift_id || !work_date) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn đầy đủ nhân viên, ca làm việc và ngày phân ca'
      });
    }

    // Check duplicate assignment for employee on that work_date
    const [existing] = await pool.execute(
      'SELECT id FROM employee_shifts WHERE employee_id = ? AND work_date = ?',
      [employee_id, work_date]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Nhân viên này đã được phân ca vào ngày đã chọn rồi!'
      });
    }

    const [result] = await pool.execute(
      'INSERT INTO employee_shifts (employee_id, shift_id, work_date) VALUES (?, ?, ?)',
      [employee_id, shift_id, work_date]
    );

    return res.status(201).json({
      success: true,
      message: 'Phân ca làm việc thành công',
      data: {
        id: result.insertId,
        employee_id,
        shift_id,
        work_date
      }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Nhân viên này đã được phân ca vào ngày đã chọn rồi!'
      });
    }
    console.error('createEmployeeShift error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi gán ca làm việc: ' + err.message
    });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const { employee_id, shift_id, work_date } = req.body;

    if (!employee_id || !shift_id || !work_date) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ thông tin phân ca'
      });
    }

    // Check duplicate against other records
    const [existing] = await pool.execute(
      'SELECT id FROM employee_shifts WHERE employee_id = ? AND work_date = ? AND id != ?',
      [employee_id, work_date, id]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Nhân viên này đã có ca khác trong ngày đã chọn!'
      });
    }

    const [result] = await pool.execute(
      'UPDATE employee_shifts SET employee_id = ?, shift_id = ?, work_date = ? WHERE id = ?',
      [employee_id, shift_id, work_date, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bản ghi phân ca cần cập nhật'
      });
    }

    return res.json({
      success: true,
      message: 'Cập nhật phân ca thành công',
      data: {
        id: Number(id),
        employee_id,
        shift_id,
        work_date
      }
    });
  } catch (err) {
    console.error('updateEmployeeShift error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi cập nhật phân ca: ' + err.message
    });
  }
}

async function remove(req, res) {
  try {
    const { id } = req.params;

    const [result] = await pool.execute('DELETE FROM employee_shifts WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bản ghi phân ca cần xóa'
      });
    }

    return res.json({
      success: true,
      message: 'Xóa phân ca làm việc thành công'
    });
  } catch (err) {
    console.error('deleteEmployeeShift error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi xóa phân ca: ' + err.message
    });
  }
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove
};
