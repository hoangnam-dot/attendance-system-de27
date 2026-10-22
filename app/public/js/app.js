// Main Application Controller (Admin Portal)

// Global state caches
let employeesCache = [];
let shiftsCache = [];
let empShiftsCache = [];

// Initialize application on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Verify authentication & role
  try {
    const res = await api.get('/api/auth/me');
    if (!res || !res.success) {
      window.location.href = '/login.html';
      return;
    }
    const user = res.data.user;
    // Role protection: If EMPLOYEE, redirect to employee portal
    if (user.role !== 'ADMIN') {
      window.location.href = '/employee.html';
      return;
    }

    document.getElementById('current-username').textContent = user.username;
    document.getElementById('user-role').textContent = user.role || 'Admin';
    document.getElementById('user-avatar-initial').textContent = (user.username || 'A')[0].toUpperCase();
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

  // 5. Pre-load shared data caches (employees, shifts)
  await loadMetadataCaches();

  // 6. Load initial Dashboard section
  await loadDashboard();

  // 7. Setup form handlers & modal closures
  setupEventHandlers();
});

// Real-time clock display
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

// Navigation handling between view sections
function initNavigation() {
  const navButtons = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.view-section');
  const titleEl = document.getElementById('view-title');

  const titles = {
    'section-dashboard': 'Tổng quan Hệ thống (Dashboard)',
    'section-attendance': 'Điểm danh Vào / Ra (Check-in & Check-out)',
    'section-employees': 'Quản lý Nhân viên',
    'section-shifts': 'Quản lý Ca làm việc',
    'section-employee-shifts': 'Phân ca làm việc (Lịch phân ca)',
    'section-history': 'Lịch sử Điểm danh'
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

      // Trigger data refresh for selected section
      if (targetId === 'section-dashboard') await loadDashboard();
      if (targetId === 'section-attendance') await loadAttendanceSection();
      if (targetId === 'section-employees') await loadEmployees();
      if (targetId === 'section-shifts') await loadShifts();
      if (targetId === 'section-employee-shifts') await loadEmployeeShifts();
      if (targetId === 'section-history') await loadHistory();
    });
  });
}

// Pre-load employee and shift lists for select dropdowns
async function loadMetadataCaches() {
  try {
    const [empRes, shiftRes] = await Promise.all([
      api.get('/api/employees'),
      api.get('/api/shifts')
    ]);

    employeesCache = empRes.data || [];
    shiftsCache = shiftRes.data || [];

    populateSelectOptions();
  } catch (e) {
    console.error('Error pre-loading caches:', e);
  }
}

function populateSelectOptions() {
  const empSelects = [
    document.getElementById('quick-employee-select'),
    document.getElementById('checkin-employee-select'),
    document.getElementById('filter-employee-select'),
    document.getElementById('empshift-employee-select')
  ];

  empSelects.forEach(sel => {
    if (!sel) return;
    const isFilter = sel.id === 'filter-employee-select';
    sel.innerHTML = isFilter ? '<option value="">-- Tất cả nhân viên --</option>' : '<option value="">-- Chọn nhân viên --</option>';
    employeesCache.forEach(emp => {
      const opt = document.createElement('option');
      opt.value = emp.id;
      opt.textContent = `[${emp.employee_code}] ${emp.full_name} (${emp.department})`;
      sel.appendChild(opt);
    });
  });

  const shiftSelects = [
    document.getElementById('quick-shift-select'),
    document.getElementById('checkin-shift-select'),
    document.getElementById('empshift-shift-select')
  ];

  shiftSelects.forEach(sel => {
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Chọn ca làm việc --</option>';
    shiftsCache.forEach(shift => {
      const opt = document.createElement('option');
      opt.value = shift.id;
      opt.textContent = `${shift.shift_name} (${shift.start_time} - ${shift.end_time})`;
      sel.appendChild(opt);
    });
  });
}

// =========================================================================
// 1. DASHBOARD
// =========================================================================
async function loadDashboard() {
  try {
    const res = await api.get('/api/dashboard/stats');
    if (!res || !res.success) return;

    const { stats, recent_attendance } = res.data;

    document.getElementById('stat-total-employees').textContent = stats.total_employees;
    document.getElementById('stat-checked-in-today').textContent = stats.checked_in_today;
    document.getElementById('stat-not-checked-in').textContent = stats.not_checked_in;
    document.getElementById('stat-late-today').textContent = stats.late_today;

    renderRecentAttendance(recent_attendance);
  } catch (err) {
    showToast('Lỗi tải thống kê: ' + err.message, 'error');
  }
}

function renderRecentAttendance(list) {
  const tbody = document.getElementById('recent-attendance-tbody');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Chưa có lượt điểm danh nào</td></tr>`;
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
        <td><span class="badge-code">${item.employee_code}</span></td>
        <td><strong>${item.full_name}</strong></td>
        <td><span class="badge badge-department">${item.department}</span></td>
        <td>${item.attendance_date}</td>
        <td>${item.shift_name}</td>
        <td><strong>${item.check_in}</strong></td>
        <td>${checkOutDisplay}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

// =========================================================================
// 2. CHECK-IN & CHECK-OUT SECTION (ADMIN)
// =========================================================================
async function loadAttendanceSection() {
  try {
    await loadMetadataCaches();
    const res = await api.get('/api/attendance/today');
    if (!res || !res.success) return;

    const tbody = document.getElementById('today-attendance-tbody');
    if (!tbody) return;

    const list = res.data || [];
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Hôm nay chưa có ai điểm danh</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(item => {
      const statusBadge = item.status === 'LATE'
        ? `<span class="badge badge-late">⏰ Đi muộn</span>`
        : `<span class="badge badge-on-time">✅ Đúng giờ</span>`;

      const checkOutAction = item.check_out
        ? `<strong>${item.check_out}</strong>`
        : `<button class="btn btn-sm btn-primary" onclick="handleCheckOut(${item.id})">🚪 Check-out ngay</button>`;

      return `
        <tr>
          <td><span class="badge-code">${item.employee_code}</span></td>
          <td><strong>${item.full_name}</strong></td>
          <td><span class="badge badge-department">${item.department}</span></td>
          <td>${item.shift_name}</td>
          <td><strong>${item.check_in}</strong></td>
          <td>${checkOutAction}</td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    showToast('Lỗi tải danh sách điểm danh hôm nay: ' + err.message, 'error');
  }
}

async function handleCheckInSubmit(employee_id, shift_id, check_in_time = null, attendance_date = null) {
  if (!employee_id || !shift_id) {
    showToast('Vui lòng chọn nhân viên và ca làm việc', 'error');
    return false;
  }

  try {
    const payload = {
      employee_id: parseInt(employee_id, 10),
      shift_id: parseInt(shift_id, 10)
    };
    if (check_in_time) payload.check_in_time = check_in_time;
    if (attendance_date) payload.attendance_date = attendance_date;

    const res = await api.post('/api/attendance/check-in', payload);
    if (res && res.success) {
      showToast(res.message, 'success');
      return true;
    }
  } catch (err) {
    showToast(err.message, 'error');
    return false;
  }
}

async function handleCheckOut(attendanceId) {
  if (!confirm('Xác nhận Check-out cho nhân viên này?')) return;

  try {
    const res = await api.post('/api/attendance/check-out', { attendance_id: attendanceId });
    if (res && res.success) {
      showToast(res.message, 'success');
      await loadAttendanceSection();
      await loadDashboard();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// =========================================================================
// 3. EMPLOYEE MANAGEMENT
// =========================================================================
async function loadEmployees() {
  const searchInput = document.getElementById('search-employee-input');
  const query = searchInput ? searchInput.value.trim() : '';

  try {
    const url = query ? `/api/employees?search=${encodeURIComponent(query)}` : '/api/employees';
    const res = await api.get(url);
    if (!res || !res.success) return;

    employeesCache = res.data || [];
    renderEmployeesTable(employeesCache);
    populateSelectOptions();
  } catch (err) {
    showToast('Lỗi tải danh sách nhân viên: ' + err.message, 'error');
  }
}

function renderEmployeesTable(list) {
  const tbody = document.getElementById('employees-tbody');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Không tìm thấy nhân viên nào</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(emp => `
    <tr>
      <td><span class="badge-code">${emp.employee_code}</span></td>
      <td><strong>${emp.full_name}</strong></td>
      <td>${emp.email}</td>
      <td><span class="badge badge-department">${emp.department}</span></td>
      <td>${emp.created_at || '—'}</td>
      <td>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-sm btn-secondary" onclick="openEditEmployeeModal(${emp.id})">✏️ Sửa</button>
          <button class="btn btn-sm btn-danger" onclick="deleteEmployee(${emp.id}, '${emp.full_name}')">🗑️ Xóa</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openAddEmployeeModal() {
  document.getElementById('modal-employee-title').textContent = 'Thêm Nhân viên Mới';
  document.getElementById('employee-id').value = '';
  document.getElementById('employee-code').value = '';
  document.getElementById('employee-name').value = '';
  document.getElementById('employee-email').value = '';
  document.getElementById('employee-dept').value = '';
  openModal('modal-employee');
}

function openEditEmployeeModal(id) {
  const emp = employeesCache.find(e => e.id === id);
  if (!emp) return;

  document.getElementById('modal-employee-title').textContent = 'Cập nhật Nhân viên';
  document.getElementById('employee-id').value = emp.id;
  document.getElementById('employee-code').value = emp.employee_code;
  document.getElementById('employee-name').value = emp.full_name;
  document.getElementById('employee-email').value = emp.email;
  document.getElementById('employee-dept').value = emp.department;
  openModal('modal-employee');
}

async function saveEmployee(e) {
  e.preventDefault();
  const id = document.getElementById('employee-id').value;
  const payload = {
    employee_code: document.getElementById('employee-code').value.trim(),
    full_name: document.getElementById('employee-name').value.trim(),
    email: document.getElementById('employee-email').value.trim(),
    department: document.getElementById('employee-dept').value.trim()
  };

  try {
    if (id) {
      const res = await api.put(`/api/employees/${id}`, payload);
      showToast(res.message, 'success');
    } else {
      const res = await api.post('/api/employees', payload);
      showToast(res.message, 'success');
    }
    closeModal('modal-employee');
    await loadEmployees();
    await loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteEmployee(id, name) {
  if (!confirm(`Bạn có chắc muốn xóa nhân viên "${name}"? Tất cả phân ca và lịch sử điểm danh sẽ bị xóa theo!`)) {
    return;
  }

  try {
    const res = await api.delete(`/api/employees/${id}`);
    showToast(res.message, 'success');
    await loadEmployees();
    await loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// =========================================================================
// 4. SHIFT MANAGEMENT
// =========================================================================
async function loadShifts() {
  try {
    const res = await api.get('/api/shifts');
    if (!res || !res.success) return;

    shiftsCache = res.data || [];
    renderShiftsTable(shiftsCache);
    populateSelectOptions();
  } catch (err) {
    showToast('Lỗi tải ca làm việc: ' + err.message, 'error');
  }
}

function renderShiftsTable(list) {
  const tbody = document.getElementById('shifts-tbody');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Chưa có ca làm việc nào</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(shift => `
    <tr>
      <td>#${shift.id}</td>
      <td><strong>${shift.shift_name}</strong></td>
      <td><span class="badge badge-on-time">${shift.start_time}</span></td>
      <td><span class="badge badge-pending">${shift.end_time}</span></td>
      <td>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-sm btn-secondary" onclick="openEditShiftModal(${shift.id})">✏️ Sửa</button>
          <button class="btn btn-sm btn-danger" onclick="deleteShift(${shift.id}, '${shift.shift_name}')">🗑️ Xóa</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openAddShiftModal() {
  document.getElementById('modal-shift-title').textContent = 'Thêm Ca làm việc';
  document.getElementById('shift-id').value = '';
  document.getElementById('shift-name').value = '';
  document.getElementById('shift-start').value = '08:00';
  document.getElementById('shift-end').value = '17:00';
  openModal('modal-shift');
}

function openEditShiftModal(id) {
  const shift = shiftsCache.find(s => s.id === id);
  if (!shift) return;

  document.getElementById('modal-shift-title').textContent = 'Cập nhật Ca làm việc';
  document.getElementById('shift-id').value = shift.id;
  document.getElementById('shift-name').value = shift.shift_name;
  document.getElementById('shift-start').value = shift.start_time;
  document.getElementById('shift-end').value = shift.end_time;
  openModal('modal-shift');
}

async function saveShift(e) {
  e.preventDefault();
  const id = document.getElementById('shift-id').value;
  const payload = {
    shift_name: document.getElementById('shift-name').value.trim(),
    start_time: document.getElementById('shift-start').value,
    end_time: document.getElementById('shift-end').value
  };

  try {
    if (id) {
      const res = await api.put(`/api/shifts/${id}`, payload);
      showToast(res.message, 'success');
    } else {
      const res = await api.post('/api/shifts', payload);
      showToast(res.message, 'success');
    }
    closeModal('modal-shift');
    await loadShifts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteShift(id, name) {
  if (!confirm(`Bạn có chắc muốn xóa ca làm việc "${name}"?`)) return;

  try {
    const res = await api.delete(`/api/shifts/${id}`);
    showToast(res.message, 'success');
    await loadShifts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// =========================================================================
// 5. EMPLOYEE SHIFTS (PHÂN CA LÀM VIỆC)
// =========================================================================
async function loadEmployeeShifts() {
  const dateInput = document.getElementById('filter-empshift-date');
  const dateVal = dateInput ? dateInput.value : '';

  try {
    const url = dateVal ? `/api/employee-shifts?date=${dateVal}` : '/api/employee-shifts';
    const res = await api.get(url);
    if (!res || !res.success) return;

    empShiftsCache = res.data || [];
    renderEmployeeShiftsTable(empShiftsCache);
  } catch (err) {
    showToast('Lỗi tải danh sách phân ca: ' + err.message, 'error');
  }
}

function renderEmployeeShiftsTable(list) {
  const tbody = document.getElementById('empshifts-tbody');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Chưa có phân ca làm việc nào</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(item => `
    <tr>
      <td><span class="badge-code">${item.employee_code}</span></td>
      <td><strong>${item.full_name}</strong></td>
      <td><span class="badge badge-department">${item.department}</span></td>
      <td><strong>${item.work_date}</strong></td>
      <td>${item.shift_name}</td>
      <td><span class="badge badge-on-time">${item.start_time} - ${item.end_time}</span></td>
      <td>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-sm btn-secondary" onclick="openEditEmpShiftModal(${item.id})">✏️ Sửa</button>
          <button class="btn btn-sm btn-danger" onclick="deleteEmpShift(${item.id}, '${item.full_name}', '${item.work_date}')">🗑️ Xóa</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openAddEmpShiftModal() {
  document.getElementById('modal-empshift-title').textContent = 'Phân Ca làm việc Mới';
  document.getElementById('empshift-id').value = '';
  document.getElementById('empshift-employee-select').disabled = false;
  document.getElementById('empshift-employee-select').value = '';
  document.getElementById('empshift-shift-select').value = '';
  
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('empshift-date-input').value = today;

  openModal('modal-empshift');
}

function openEditEmpShiftModal(id) {
  const item = empShiftsCache.find(x => x.id === id);
  if (!item) return;

  document.getElementById('modal-empshift-title').textContent = 'Cập nhật Phân ca';
  document.getElementById('empshift-id').value = item.id;
  document.getElementById('empshift-employee-select').value = item.employee_id;
  document.getElementById('empshift-employee-select').disabled = false;
  document.getElementById('empshift-shift-select').value = item.shift_id;
  document.getElementById('empshift-date-input').value = item.work_date;

  openModal('modal-empshift');
}

async function saveEmpShift(e) {
  e.preventDefault();
  const id = document.getElementById('empshift-id').value;
  const payload = {
    employee_id: parseInt(document.getElementById('empshift-employee-select').value, 10),
    shift_id: parseInt(document.getElementById('empshift-shift-select').value, 10),
    work_date: document.getElementById('empshift-date-input').value
  };

  try {
    if (id) {
      const res = await api.put(`/api/employee-shifts/${id}`, payload);
      showToast(res.message, 'success');
    } else {
      const res = await api.post('/api/employee-shifts', payload);
      showToast(res.message, 'success');
    }
    closeModal('modal-empshift');
    await loadEmployeeShifts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteEmpShift(id, name, date) {
  if (!confirm(`Xóa phân ca ngày ${date} của nhân viên "${name}"?`)) return;

  try {
    const res = await api.delete(`/api/employee-shifts/${id}`);
    showToast(res.message, 'success');
    await loadEmployeeShifts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// =========================================================================
// 6. ATTENDANCE HISTORY
// =========================================================================
async function loadHistory() {
  const dateVal = document.getElementById('filter-date-input').value;
  const empVal = document.getElementById('filter-employee-select').value;
  const statusVal = document.getElementById('filter-status-select').value;

  const params = new URLSearchParams();
  if (dateVal) params.append('date', dateVal);
  if (empVal) params.append('employee_id', empVal);
  if (statusVal) params.append('status', statusVal);

  try {
    const res = await api.get(`/api/attendance?${params.toString()}`);
    if (!res || !res.success) return;

    renderHistoryTable(res.data || []);
  } catch (err) {
    showToast('Lỗi tải lịch sử: ' + err.message, 'error');
  }
}

function renderHistoryTable(list) {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Không có bản ghi điểm danh nào phù hợp với bộ lọc</td></tr>`;
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
        <td><span class="badge-code">${item.employee_code}</span></td>
        <td><strong>${item.full_name}</strong></td>
        <td><span class="badge badge-department">${item.department}</span></td>
        <td>${item.attendance_date}</td>
        <td>${item.shift_name}</td>
        <td><strong>${item.check_in}</strong></td>
        <td>${checkOutDisplay}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

// =========================================================================
// MODALS & EVENT HANDLERS
// =========================================================================
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

function setupEventHandlers() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  });

  document.querySelectorAll('.modal-close, .btn-modal-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-overlay');
      if (modal) modal.classList.remove('active');
    });
  });

  const empForm = document.getElementById('form-employee');
  if (empForm) empForm.addEventListener('submit', saveEmployee);

  const shiftForm = document.getElementById('form-shift');
  if (shiftForm) shiftForm.addEventListener('submit', saveShift);

  const empShiftForm = document.getElementById('form-empshift');
  if (empShiftForm) empShiftForm.addEventListener('submit', saveEmpShift);

  const filterEmpShiftDate = document.getElementById('filter-empshift-date');
  if (filterEmpShiftDate) filterEmpShiftDate.addEventListener('change', loadEmployeeShifts);

  const searchEmpInput = document.getElementById('search-employee-input');
  if (searchEmpInput) {
    let debounceTimer;
    searchEmpInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadEmployees, 300);
    });
  }

  const quickForm = document.getElementById('quick-checkin-form');
  if (quickForm) {
    quickForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const empId = document.getElementById('quick-employee-select').value;
      const shiftId = document.getElementById('quick-shift-select').value;
      const customTime = document.getElementById('quick-checkin-time').value;

      const success = await handleCheckInSubmit(empId, shiftId, customTime || null);
      if (success) {
        quickForm.reset();
        await loadDashboard();
      }
    });
  }

  const mainCheckInForm = document.getElementById('main-checkin-form');
  if (mainCheckInForm) {
    mainCheckInForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const empId = document.getElementById('checkin-employee-select').value;
      const shiftId = document.getElementById('checkin-shift-select').value;
      const dateVal = document.getElementById('checkin-date-input').value;
      const timeVal = document.getElementById('checkin-time-input').value;

      const success = await handleCheckInSubmit(empId, shiftId, timeVal || null, dateVal || null);
      if (success) {
        mainCheckInForm.reset();
        setDefaultDates();
        await loadAttendanceSection();
        await loadDashboard();
      }
    });
  }

  const filterDate = document.getElementById('filter-date-input');
  const filterEmp = document.getElementById('filter-employee-select');
  const filterStatus = document.getElementById('filter-status-select');
  const btnResetFilter = document.getElementById('btn-reset-filter');

  if (filterDate) filterDate.addEventListener('change', loadHistory);
  if (filterEmp) filterEmp.addEventListener('change', loadHistory);
  if (filterStatus) filterStatus.addEventListener('change', loadHistory);
  if (btnResetFilter) {
    btnResetFilter.addEventListener('click', () => {
      filterDate.value = '';
      filterEmp.value = '';
      filterStatus.value = '';
      loadHistory();
    });
  }

  setDefaultDates();
}

function setDefaultDates() {
  const today = new Date().toISOString().split('T')[0];
  const checkinDateInput = document.getElementById('checkin-date-input');
  if (checkinDateInput && !checkinDateInput.value) {
    checkinDateInput.value = today;
  }
}
