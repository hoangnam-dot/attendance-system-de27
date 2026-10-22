const { pool } = require('../config/db');

async function getAll(req, res) {
  try {
    const [shifts] = await pool.query(`
      SELECT 
        id, 
        shift_name, 
        TIME_FORMAT(start_time, '%H:%i') AS start_time, 
        TIME_FORMAT(end_time, '%H:%i') AS end_time 
      FROM shifts 
      ORDER BY start_time ASC
    `);

    return res.json({
      success: true,
      data: shifts
    });
  } catch (err) {
    console.error('getShifts error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi tải danh sách ca làm việc: ' + err.message
    });
  }
}

async function getById(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(`
      SELECT 
        id, 
        shift_name, 
        TIME_FORMAT(start_time, '%H:%i') AS start_time, 
        TIME_FORMAT(end_time, '%H:%i') AS end_time 
      FROM shifts 
      WHERE id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy ca làm việc'
      });
    }

    return res.json({
      success: true,
      data: rows[0]
    });
  } catch (err) {
    console.error('getShiftById error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ: ' + err.message
    });
  }
}

async function create(req, res) {
  try {
    const { shift_name, start_time, end_time } = req.body;

    if (!shift_name || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ tên ca, giờ bắt đầu và giờ kết thúc'
      });
    }

    // Ensure format HH:MM:SS
    const formattedStart = start_time.length === 5 ? `${start_time}:00` : start_time;
    const formattedEnd = end_time.length === 5 ? `${end_time}:00` : end_time;

    const [result] = await pool.execute(
      'INSERT INTO shifts (shift_name, start_time, end_time) VALUES (?, ?, ?)',
      [shift_name.trim(), formattedStart, formattedEnd]
    );

    return res.status(201).json({
      success: true,
      message: 'Tạo ca làm việc mới thành công',
      data: {
        id: result.insertId,
        shift_name: shift_name.trim(),
        start_time: formattedStart.substring(0, 5),
        end_time: formattedEnd.substring(0, 5)
      }
    });
  } catch (err) {
    console.error('createShift error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi tạo ca làm việc: ' + err.message
    });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const { shift_name, start_time, end_time } = req.body;

    if (!shift_name || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ tên ca, giờ bắt đầu và giờ kết thúc'
      });
    }

    const formattedStart = start_time.length === 5 ? `${start_time}:00` : start_time;
    const formattedEnd = end_time.length === 5 ? `${end_time}:00` : end_time;

    const [result] = await pool.execute(
      'UPDATE shifts SET shift_name = ?, start_time = ?, end_time = ? WHERE id = ?',
      [shift_name.trim(), formattedStart, formattedEnd, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy ca làm việc cần cập nhật'
      });
    }

    return res.json({
      success: true,
      message: 'Cập nhật ca làm việc thành công',
      data: {
        id: Number(id),
        shift_name: shift_name.trim(),
        start_time: formattedStart.substring(0, 5),
        end_time: formattedEnd.substring(0, 5)
      }
    });
  } catch (err) {
    console.error('updateShift error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi cập nhật ca làm việc: ' + err.message
    });
  }
}

async function remove(req, res) {
  try {
    const { id } = req.params;

    const [result] = await pool.execute('DELETE FROM shifts WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy ca làm việc cần xóa'
      });
    }

    return res.json({
      success: true,
      message: 'Xóa ca làm việc thành công'
    });
  } catch (err) {
    console.error('deleteShift error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa ca làm việc: ' + err.message
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
