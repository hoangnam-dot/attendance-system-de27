const { pool } = require('../config/db');

async function getAll(req, res) {
  try {
    const { search } = req.query;
    let query = `
      SELECT 
        id, 
        employee_code, 
        full_name, 
        email, 
        department, 
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at 
      FROM employees
    `;
    const params = [];

    if (search && search.trim() !== '') {
      const term = `%${search.trim()}%`;
      query += ` WHERE employee_code LIKE ? OR full_name LIKE ? OR email LIKE ? OR department LIKE ?`;
      params.push(term, term, term, term);
    }

    query += ' ORDER BY id ASC';

    const [employees] = await pool.execute(query, params);
    return res.json({
      success: true,
      data: employees
    });
  } catch (err) {
    console.error('getEmployees error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi tải danh sách nhân viên: ' + err.message
    });
  }
}

async function getById(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      'SELECT id, employee_code, full_name, email, department, created_at FROM employees WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhân viên'
      });
    }

    return res.json({
      success: true,
      data: rows[0]
    });
  } catch (err) {
    console.error('getEmployeeById error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ: ' + err.message
    });
  }
}

async function create(req, res) {
  try {
    const { employee_code, full_name, email, department } = req.body;

    if (!employee_code || !full_name || !email || !department) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ các thông tin: Mã nhân viên, Họ tên, Email, Phòng ban'
      });
    }

    // Check duplicate code
    const [existing] = await pool.execute(
      'SELECT id FROM employees WHERE employee_code = ?',
      [employee_code.trim()]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Mã nhân viên "${employee_code}" đã tồn tại trên hệ thống`
      });
    }

    const [result] = await pool.execute(
      'INSERT INTO employees (employee_code, full_name, email, department) VALUES (?, ?, ?, ?)',
      [employee_code.trim(), full_name.trim(), email.trim(), department.trim()]
    );

    return res.status(201).json({
      success: true,
      message: 'Thêm nhân viên mới thành công',
      data: {
        id: result.insertId,
        employee_code: employee_code.trim(),
        full_name: full_name.trim(),
        email: email.trim(),
        department: department.trim()
      }
    });
  } catch (err) {
    console.error('createEmployee error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi thêm nhân viên: ' + err.message
    });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const { employee_code, full_name, email, department } = req.body;

    if (!employee_code || !full_name || !email || !department) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ các thông tin bắt buộc'
      });
    }

    // Check duplicate code against other employees
    const [existing] = await pool.execute(
      'SELECT id FROM employees WHERE employee_code = ? AND id != ?',
      [employee_code.trim(), id]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Mã nhân viên "${employee_code}" đã được sử dụng bởi nhân viên khác`
      });
    }

    const [result] = await pool.execute(
      'UPDATE employees SET employee_code = ?, full_name = ?, email = ?, department = ? WHERE id = ?',
      [employee_code.trim(), full_name.trim(), email.trim(), department.trim(), id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhân viên cần cập nhật'
      });
    }

    return res.json({
      success: true,
      message: 'Cập nhật thông tin nhân viên thành công',
      data: {
        id: Number(id),
        employee_code: employee_code.trim(),
        full_name: full_name.trim(),
        email: email.trim(),
        department: department.trim()
      }
    });
  } catch (err) {
    console.error('updateEmployee error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi cập nhật nhân viên: ' + err.message
    });
  }
}

async function remove(req, res) {
  try {
    const { id } = req.params;

    const [result] = await pool.execute('DELETE FROM employees WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhân viên cần xóa'
      });
    }

    return res.json({
      success: true,
      message: 'Xóa nhân viên thành công'
    });
  } catch (err) {
    console.error('deleteEmployee error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa nhân viên: ' + err.message
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
