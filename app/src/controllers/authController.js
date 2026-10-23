const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { JWT_SECRET } = require('../middleware/auth');

async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập tên đăng nhập và mật khẩu'
      });
    }

    const [rows] = await pool.execute(
      'SELECT id, username, password_hash, role, employee_id FROM users WHERE username = ? LIMIT 1',
      [username.trim()]
    );

    if (rows.length === 0) {
      console.warn(`[AUTH] Login failed: username=${username.trim()} not found`);
      return res.status(401).json({
        success: false,
        message: 'Tài khoản hoặc mật khẩu không chính xác'
      });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      console.warn(`[AUTH] Login failed: invalid password for username=${username.trim()}`);
      return res.status(401).json({
        success: false,
        message: 'Tài khoản hoặc mật khẩu không chính xác'
      });
    }

    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      employee_id: user.employee_id
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    console.log(`[AUTH] Login successful: username=${user.username}, role=${user.role}, employee_id=${user.employee_id || 'none'}`);

    return res.json({
      success: true,
      message: 'Đăng nhập thành công',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          employee_id: user.employee_id
        }
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({
      success: false,
      message: 'Đã có lỗi xảy ra trên máy chủ: ' + err.message
    });
  }
}

async function logout(req, res) {
  res.clearCookie('token');
  return res.json({
    success: true,
    message: 'Đăng xuất thành công'
  });
}

async function getMe(req, res) {
  try {
    const user = { ...req.user };
    if (user.employee_id) {
      const [empRows] = await pool.execute(
        'SELECT id, employee_code, full_name, email, department FROM employees WHERE id = ?',
        [user.employee_id]
      );
      if (empRows.length > 0) {
        user.employee = empRows[0];
      }
    }

    return res.json({
      success: true,
      data: { user }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi lấy thông tin tài khoản: ' + err.message
    });
  }
}

module.exports = {
  login,
  logout,
  getMe
};
