// Employee Portal Controller

let currentProfile = null;
let currentShift = null;
let currentAttendance = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Verify authentication & role
  try {
    const res = await api.get('/api/auth/me');
    if (!res || !res.success) {
      window.location.href = '/login.html';
      return;
    }

    const user = res.data.user;
    if (user.role !== 'EMPLOYEE') {
      window.location.href = '/';
      return;
    }

    // Set initial display
    document.getElementById('emp-user-name').textContent = user.username;
    document.getElementById('emp-avatar-initial').textContent = (user.username || 'E')[0].toUpperCase();
  } catch (e) {
    window.location.href = '/login.html';
    return;
  }

  // 2. Setup real-time clock
  initClock();

  // 3. Setup navigation tabs
  initNavigation();

  // 4. Setup logout
  document.getElementById('btn-logout').addEventListener('click', async () => {
    try {
      await api.post('/api/auth/logout', {});
    } catch (e) {}
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
  });

  // 5. Load profile and today's status
  await loadProfile();
  await loadTodayWorkspace();
  await loadMyHistory();

  // 6. Setup filter listeners
  setupFilters();
});

function initClock() {
  const clockEl = document.getElementById('clock-display');
  function update() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (clockEl) {
      clockEl.textContent = `${dateStr} • ${timeStr}`;
    }
  }
  update();
  setInterval(update, 1000);
}

function initNavigation() {
  const navButtons = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.view-section');
  const titleEl = document.getElementById('emp-view-title');

  const titles = {
    'emp-section-home': 'Bàn làm việc Nhân viên',
    'emp-section-history': 'Lịch sử Điểm danh của Tôi',
    'emp-section-profile': 'Thông tin Cá nhân'
  };

  navButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetId = btn.getAttribute('data-target');
      if (!targetId) return;

      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      sections.forEach(s => s.classList.remove('active'));
      const activeSection = document.getElementById(targetId);
      if (activeSection) activeSection.classList.add('active');

      if (titleEl && titles[targetId]) {
        titleEl.textContent = titles[targetId];
      }

      if (targetId === 'emp-section-home') await loadTodayWorkspace();
      if (targetId === 'emp-section-history') await loadMyHistory();
      if (targetId === 'emp-section-profile') await loadProfile();
    });
  });
}

// 1. Profile
async function loadProfile() {
  try {
    const res = await api.get('/api/employee/profile');
    if (!res || !res.success) return;

    currentProfile = res.data;

    document.getElementById('welcome-title').textContent = `Xin chào, ${currentProfile.full_name}!`;
    document.getElementById('welcome-sub').textContent = `Mã NV: ${currentProfile.employee_code} • Phòng ban: ${currentProfile.department}`;

    document.getElementById('emp-user-name').textContent = currentProfile.full_name;
    document.getElementById('emp-user-code').textContent = currentProfile.employee_code;
    document.getElementById('emp-avatar-initial').textContent = (currentProfile.full_name || 'E')[0].toUpperCase();

    // Profile section
    document.getElementById('profile-code').textContent = currentProfile.employee_code;
    document.getElementById('profile-name').textContent = currentProfile.full_name;
    document.getElementById('profile-email').textContent = currentProfile.email;
    document.getElementById('profile-department').textContent = currentProfile.department;
    document.getElementById('profile-created').textContent = currentProfile.created_at || '—';
  } catch (err) {
    showToast('Lỗi tải thông tin cá nhân: ' + err.message, 'error');
  }
}

// 2. Today's Shift & Attendance
async function loadTodayWorkspace() {
  try {
    const [shiftRes, attRes] = await Promise.all([
      api.get('/api/employee/today-shift'),
      api.get('/api/employee/today-attendance')
    ]);

    currentShift = shiftRes.data;
    currentAttendance = attRes.data;

    renderTodayShift(currentShift);
    renderAttendanceAction(currentShift, currentAttendance);
  } catch (err) {
    showToast('Lỗi tải thông tin hôm nay: ' + err.message, 'error');
  }
}

function renderTodayShift(shift) {
  const nameEl = document.getElementById('today-shift-name');
  const timeEl = document.getElementById('today-shift-time');
  const badgeEl = document.getElementById('today-shift-badge');

  if (!shift) {
    nameEl.textContent = 'Hôm nay bạn chưa có lịch phân ca làm việc';
    timeEl.textContent = 'Vui lòng liên hệ Quản trị viên để được phân ca.';
    badgeEl.innerHTML = `<span class="badge badge-pending">Không có ca</span>`;
    return;
  }

  nameEl.textContent = shift.shift_name;
  timeEl.textContent = `Khung giờ làm việc: ${shift.start_time} — ${shift.end_time}`;
  badgeEl.innerHTML = `<span class="badge badge-on-time">Đã được phân ca</span>`;
}

function renderAttendanceAction(shift, att) {
  const container = document.getElementById('attendance-action-container');
  if (!container) return;

  // Case 1: No shift assigned
  if (!shift) {
    container.innerHTML = `
      <div class="action-button-area">
        <p style="color: var(--text-muted); font-size: 0.95rem;">
          ⚠️ Bạn chưa có ca làm việc hôm nay nên không thể điểm danh.
        </p>
      </div>
    `;
    return;
  }

  // Case 2: Has shift, NOT checked in yet
  if (!att) {
    container.innerHTML = `
      <div class="action-button-area">
        <p style="color: var(--text-muted); margin-bottom: 16px; font-size: 0.95rem;">
          Bạn chưa thực hiện điểm danh ca <strong>${shift.shift_name}</strong> hôm nay.
        </p>
        <button class="btn-big-action btn-primary" onclick="handleEmployeeCheckIn()">
          🎯 [ CHECK-IN NGAY ]
        </button>
      </div>
    `;
    return;
  }

  // Case 3: Checked in, NOT checked out yet
  if (att && !att.check_out) {
    const statusBadge = att.status === 'LATE'
      ? `<span class="badge badge-late">⏰ Đi muộn (LATE)</span>`
      : `<span class="badge badge-on-time">✅ Đúng giờ (ON_TIME)</span>`;

    container.innerHTML = `
      <div class="action-button-area" style="background: var(--success-bg); border-color: var(--success-border);">
        <div style="margin-bottom: 16px;">
          <h4 style="font-size: 1.1rem; color: var(--success-text); margin-bottom: 6px;">
            Đã Check-in lúc: <strong>${att.check_in}</strong>
          </h4>
          <p style="color: var(--text-muted); margin-bottom: 8px;">Trạng thái điểm danh: ${statusBadge}</p>
          <p style="font-size: 0.85rem; color: var(--text-muted);">Đừng quên Check-out trước khi kết thúc ca làm!</p>
        </div>
        <button class="btn-big-action btn-danger" onclick="handleEmployeeCheckOut()">
          🚪 [ CHECK-OUT NGAY ]
        </button>
      </div>
    `;
    return;
  }

  // Case 4: Completed (Both check-in and check-out done)
  if (att && att.check_out) {
    const statusBadge = att.status === 'LATE'
      ? `<span class="badge badge-late">⏰ Đi muộn</span>`
      : `<span class="badge badge-on-time">✅ Đúng giờ</span>`;

    container.innerHTML = `
      <div class="action-button-area" style="background: #f8fafc; border-color: #cbd5e1;">
        <div style="font-size: 1.8rem; margin-bottom: 8px;">🎉</div>
        <h4 style="font-size: 1.15rem; color: var(--text-main); margin-bottom: 6px;">
          Bạn đã hoàn thành ca làm việc hôm nay!
        </h4>
        <div style="display: flex; gap: 20px; justify-content: center; margin: 12px 0; flex-wrap: wrap;">
          <div>Giờ Check-in: <strong>${att.check_in}</strong></div>
          <div>Giờ Check-out: <strong>${att.check_out}</strong></div>
          <div>Trạng thái: ${statusBadge}</div>
        </div>
        <span class="badge badge-on-time" style="padding: 6px 14px; font-size: 0.85rem;">
          Đã hoàn tất ngày làm việc
        </span>
      </div>
    `;
  }
}

async function handleEmployeeCheckIn() {
  const customTime = document.getElementById('custom-action-time').value;
  const payload = {};
  if (customTime) payload.check_in_time = customTime;

  try {
    const res = await api.post('/api/employee/check-in', payload);
    if (res && res.success) {
      showToast(res.message, 'success');
      await loadTodayWorkspace();
      await loadMyHistory();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleEmployeeCheckOut() {
  if (!confirm('Xác nhận bạn muốn Check-out kết thúc ca làm hôm nay?')) return;

  const customTime = document.getElementById('custom-action-time').value;
  const payload = {};
  if (customTime) payload.check_out_time = customTime;

  try {
    const res = await api.post('/api/employee/check-out', payload);
    if (res && res.success) {
      showToast(res.message, 'success');
      await loadTodayWorkspace();
      await loadMyHistory();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 3. My History
async function loadMyHistory() {
  const dateVal = document.getElementById('my-filter-date').value;
  const statusVal = document.getElementById('my-filter-status').value;

  const params = new URLSearchParams();
  if (dateVal) params.append('date', dateVal);
  if (statusVal) params.append('status', statusVal);

  try {
    const res = await api.get(`/api/employee/history?${params.toString()}`);
    if (!res || !res.success) return;

    renderMyHistoryTable(res.data || []);
  } catch (err) {
    showToast('Lỗi tải lịch sử cá nhân: ' + err.message, 'error');
  }
}

function renderMyHistoryTable(list) {
  const tbody = document.getElementById('my-history-tbody');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Chưa có bản ghi điểm danh nào phù hợp</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(item => {
    const statusBadge = item.status === 'LATE'
      ? `<span class="badge badge-late">⏰ Đi muộn</span>`
      : `<span class="badge badge-on-time">✅ Đúng giờ</span>`;

    const checkOutDisplay = item.check_out 
      ? `<strong>${item.check_out}</strong>` 
      : `<span class="badge badge-pending">Chưa check-out</span>`;

    return `
      <tr>
        <td><strong>${item.attendance_date}</strong></td>
        <td>${item.shift_name}</td>
        <td><span class="badge badge-on-time">${item.start_time} - ${item.end_time}</span></td>
        <td><strong>${item.check_in}</strong></td>
        <td>${checkOutDisplay}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

function setupFilters() {
  const dateInput = document.getElementById('my-filter-date');
  const statusInput = document.getElementById('my-filter-status');
  const btnReset = document.getElementById('btn-reset-my-filter');

  if (dateInput) dateInput.addEventListener('change', loadMyHistory);
  if (statusInput) statusInput.addEventListener('change', loadMyHistory);
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      dateInput.value = '';
      statusInput.value = '';
      loadMyHistory();
    });
  }
}
