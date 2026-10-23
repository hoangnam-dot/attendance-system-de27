# attendance-system-de27
Đề 27 - Hệ thống Điểm danh / Attendance - Triển khai và Quản trị Hệ thống Phần mềm (Full Phase 1 - Phase 2 - Phase 3)

---

## 1. Giới thiệu Đề tài
Dự án xây dựng **Hệ thống Điểm danh (Attendance Management System)** phục vụ quản trị ca làm việc, phân ca, điểm danh nhân sự (Check-in / Check-out) và tra cứu lịch sử theo thời gian thực.
Hệ thống được container hóa hoàn toàn bằng **Docker Compose**, sử dụng **Nginx Reverse Proxy** kèm các tiêu chuẩn bảo mật (Security Headers), cơ sở dữ liệu quan hệ **MySQL 8.0** (chuẩn Unicode `utf8mb4`), công cụ quản trị **phpMyAdmin**, và backend **Node.js (Express)** phân quyền 2 vai trò rõ ràng: **ADMIN** và **EMPLOYEE**.

---

## 2. Kiến trúc Hệ thống (Phase 1)

Hệ thống hoạt động theo mô hình Reverse Proxy nhiều tầng trong mạng Docker bridge (`attendance_network`):

```
                                [ Trình duyệt / Client ]
                                            │
                        Port 80             │          Port 8080
               ┌────────────────────────────┴──────────────────────────┐
               ▼                                                       ▼
         ┌──────────────────┐                               ┌───────────────────┐
         │  attendance_nginx│                               │attendance_phpadmin│
         │  (Reverse Proxy) │                               │   (Port 8080)     │
         └────────┬─────────┘                               └─────────┬─────────┘
                  │ proxy_pass: http://app:3000                       │
                  ▼                                                   │
         ┌──────────────────┐                                         │
         │  attendance_app  │                                         │
         │ (Node.js/Express)│                                         │
         └────────┬─────────┘                                         │
                  │ (hostname: mysql, port 3306, utf8mb4)             │
                  └─────────────────────────┬─────────────────────────┘
                                            ▼
                                 ┌─────────────────────┐
                                 │  attendance_mysql   │
                                 │ (MySQL 8.0 & Volume)│
                                 └─────────────────────┘
```

1. **Client / Browser:** Người dùng truy cập hệ thống qua cổng HTTP chuẩn: `http://localhost/`.
2. **Nginx Reverse Proxy (`attendance_nginx`):** Tiếp nhận request tại cổng 80, gán các Security Headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy`), mã hóa ký tự `charset utf-8;`, nén gzip và proxy forward sang backend `app:3000`.
3. **Application Backend & Frontend (`attendance_app`):** Node.js Express cung cấp REST API, xác thực JWT, phân quyền RBAC và phục vụ 2 giao diện:
   - **Admin Dashboard (`/index.html`):** Quản trị toàn hệ thống.
   - **Employee Portal (`/employee.html`):** Bàn làm việc cá nhân, tự điểm danh, xem ca và lịch sử.
4. **Database (`attendance_mysql`):** MySQL 8.0 được cấu hình `utf8mb4` toàn diện, lưu trữ dữ liệu an toàn trên named volume `attendance_mysql_data`, giám sát sẵn sàng qua Docker healthcheck.
5. **Database Admin Tool (`attendance_phpmyadmin`):** phpMyAdmin chạy tại cổng `http://localhost:8080`, kết nối trực tiếp vào MySQL qua mạng nội bộ Docker.

---

## 3. Phân quyền Người dùng (Role-Based Access Control)

Hệ thống hỗ trợ 2 vai trò người dùng độc lập:

| Vai trò | Phạm vi & Quyền hạn | Giao diện điều hướng |
|---|---|---|
| **ADMIN** | Toàn quyền quản trị hệ thống: Dashboard thống kê, CRUD nhân viên, CRUD ca làm, phân ca (`employee_shifts`), điểm danh hộ, xem toàn bộ lịch sử điểm danh. Không có quyền truy cập vào endpoint điểm danh cá nhân của Employee. | Chuyển đến `/` (Admin Dashboard) |
| **EMPLOYEE** | Chỉ quản lý dữ liệu của chính mình: Xem thông tin cá nhân, xem ca làm hôm nay được phân, tự Check-in / Check-out cho chính mình (không thể can thiệp dữ liệu người khác), xem lịch sử điểm danh cá nhân. Bị chặn hoàn toàn (HTTP 403) khỏi các API quản trị Admin. | Chuyển đến `/employee.html` (Employee Portal) |

---

## 4. Database Schema (`attendance_db`)

Bộ cơ sở dữ liệu được thiết kế chuẩn mực với mã hóa `utf8mb4` và collation `utf8mb4_unicode_ci`:

1. **`users`**:
   - `id INT AUTO_INCREMENT PRIMARY KEY`
   - `username VARCHAR(50) NOT NULL UNIQUE`
   - `password_hash VARCHAR(255) NOT NULL` *(bcrypt cost 10, không lưu plaintext)*
   - `role ENUM('ADMIN', 'EMPLOYEE') NOT NULL DEFAULT 'ADMIN'`
   - `employee_id INT NULL` *(Khóa ngoại tham chiếu `employees(id)`, bắt buộc đối với vai trò EMPLOYEE)*
   - `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
2. **`employees`**:
   - `id INT AUTO_INCREMENT PRIMARY KEY`
   - `employee_code VARCHAR(50) NOT NULL UNIQUE`
   - `full_name VARCHAR(100) NOT NULL` *(hỗ trợ tiếng Việt có dấu hoàn hảo)*
   - `email VARCHAR(100) NOT NULL`
   - `department VARCHAR(100) NOT NULL`
   - `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
3. **`shifts`**:
   - `id INT AUTO_INCREMENT PRIMARY KEY`
   - `shift_name VARCHAR(50) NOT NULL`
   - `start_time TIME NOT NULL`
   - `end_time TIME NOT NULL`
4. **`employee_shifts` (Phân ca làm việc)**:
   - `id INT AUTO_INCREMENT PRIMARY KEY`
   - `employee_id INT NOT NULL` *(FK -> `employees(id)` ON DELETE CASCADE)*
   - `shift_id INT NOT NULL` *(FK -> `shifts(id)` ON DELETE CASCADE)*
   - `work_date DATE NOT NULL`
   - `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
   - `CONSTRAINT unique_employee_work_date UNIQUE (employee_id, work_date)` *(Đảm bảo mỗi nhân viên chỉ có 1 ca được phân trong 1 ngày)*
5. **`attendance`**:
   - `id INT AUTO_INCREMENT PRIMARY KEY`
   - `employee_id INT NOT NULL` *(FK -> `employees(id)` ON DELETE CASCADE)*
   - `shift_id INT NOT NULL` *(FK -> `shifts(id)` ON DELETE CASCADE)*
   - `attendance_date DATE NOT NULL`
   - `check_in TIME NOT NULL`
   - `check_out TIME NULL`
   - `status ENUM('ON_TIME', 'LATE') NOT NULL DEFAULT 'ON_TIME'`
   - `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
   - `CONSTRAINT unique_employee_shift_date UNIQUE (employee_id, shift_id, attendance_date)` *(Chống điểm danh trùng)*

---

## 5. Hướng dẫn Triển khai & Vận hành

### 5.1. Chuẩn bị Môi trường
- Đảm bảo máy tính đã cài đặt **Docker** và **Docker Compose**.
- File cấu hình môi trường `.env` mẫu được cung cấp tại `.env.example`:
  ```bash
  cp .env.example .env
  ```

### 5.2. Khởi chạy Toàn bộ Hệ thống
Chạy lệnh sau tại thư mục gốc dự án:
```bash
docker compose up -d --build
```

### 5.3. Kiểm tra Trạng thái Container
Xem danh sách và trạng thái sức khỏe của các container:
```bash
docker compose ps
```
Tất cả 4 containers (`attendance_mysql`, `attendance_app`, `attendance_nginx`, `attendance_phpmyadmin`) đều ở trạng thái **Up** / **healthy**.

### 5.4. Dừng Hệ thống
- Dừng hệ thống:
  ```bash
  docker compose down
  ```
- Dừng và xóa dữ liệu database nếu muốn khởi tạo lại từ đầu (reset development volume):
  ```bash
  docker compose down -v
  ```

---

## 6. Đường dẫn Truy cập & Tài khoản Demo

| Dịch vụ | URL Truy cập | Ghi chú |
|---|---|---|
| **Website Chính** | [http://localhost](http://localhost) | Qua Nginx Reverse Proxy (Cổng 80) |
| **Trang Đăng Nhập** | [http://localhost/login.html](http://localhost/login.html) | Tự động phân quyền điều hướng theo vai trò |
| **Cổng Nhân Viên** | [http://localhost/employee.html](http://localhost/employee.html) | Bàn làm việc & Điểm danh nhân viên |
| **phpMyAdmin** | [http://localhost:8080](http://localhost:8080) | Quản trị CSDL MySQL trực quan |

### 6.1. Tài khoản Demo Đăng nhập Website

| Loại tài khoản | Tên đăng nhập | Mật khẩu | Nhân viên liên kết | Ca hôm nay |
|---|---|---|---|---|
| **Admin** | `admin` | `admin123` | *Quản trị viên hệ thống* | Toàn quyền |
| **Employee** | `nv001` | `nv001123` | NV001 - Nguyễn Văn An | Ca Sáng (08:00 - 12:00) |
| **Employee** | `nv002` | `nv002123` | NV002 - Trần Thị Bích | Ca Chiều (13:30 - 17:30) |
| **Employee** | `nv003` | `nv003123` | NV003 - Lê Hoàng Nam | Ca Sáng (08:00 - 12:00) |

*(Trên trang đăng nhập có các nút chọn nhanh tài khoản demo để tiện trình diễn).*

### 6.2. Tài khoản phpMyAdmin
- **Server:** `mysql`
- **Username:** `root`
- **Password:** Được cấu hình trong file `.env` (không lưu trữ công khai trên GitHub)
- **Database:** `attendance_db`

---

## 7. Quy tắc Nghiệp vụ Điểm danh & Phân quyền

1. **Quy tắc Phân ca làm việc:**
   - Admin gán ca cho từng nhân viên theo từng ngày cụ thể (`employee_shifts`).
   - Ràng buộc Unique bảo đảm 1 nhân viên chỉ có 1 ca phân công mỗi ngày.
2. **Quy tắc Check-in:**
   - Nhân viên chỉ được điểm danh khi đã có ca phân công trong ngày đó.
   - So sánh giờ check-in với giờ bắt đầu ca:
     - Nếu `check_in > start_time` ➔ Trạng thái tự động gắn là **`LATE`** (Đi muộn).
     - Nếu `check_in <= start_time` ➔ Trạng thái tự động gắn là **`ON_TIME`** (Đúng giờ).
   - Chặn tuyệt đối điểm danh trùng lặp (trả về HTTP `409 Conflict`).
3. **Quy tắc Check-out:**
   - Nhân viên chỉ được Check-out cho chính bản ghi của mình sau khi đã Check-in.
   - Không cho phép Check-out nhiều lần (trả về HTTP `400 Bad Request`).
4. **Bảo mật API:**
   - Nếu không có token đăng nhập ➔ HTTP `401 Unauthorized`.
   - Nếu sai vai trò (Employee cố gọi API Admin hoặc ngược lại) ➔ HTTP `403 Forbidden`.

---

## 8. Kiến trúc Giám sát Hệ thống (Phase 2: Prometheus & Grafana)

Hệ thống được tích hợp giải pháp giám sát tập trung toàn diện theo thời gian thực chuẩn công nghiệp với **Prometheus** và **Grafana**, thu thập metrics đa tầng từ Container, Web Server (Nginx) đến Database (MySQL).

### 8.1. Sơ đồ Luồng Thu thập Metrics (Monitoring Flow)

```
       ┌────────────────────────┐      ┌────────────────────────┐
       │   attendance_cadvisor  │      │attendance_nginx_export│
       │    (Container Stats)   │      │    (Nginx stub_status) │
       │       Port: 8080       │      │       Port: 9113       │
       └───────────┬────────────┘      └───────────┬────────────┘
                   │                               │
                   │ pull metrics (15s)            │ pull metrics (15s)
                   ▼                               ▼
       ┌────────────────────────────────────────────────────────┐
       │                 attendance_prometheus                  │
       │           (Prometheus Server v3.15.1 - 9090)           │
       │               Volume: prometheus_data                  │
       └───────────▲───────────────────────────────▲────────────┘
                   │                               │
                   │ pull metrics (15s)            │ pull metrics (15s)
       ┌───────────┴────────────┐      ┌───────────┴────────────┐
       │attendance_mysql_export │      │       Prometheus       │
       │  (mysqld_exporter 9104)│      │    (Self-monitoring)   │
       │     (User: exporter)   │      │       Port: 9090       │
       └────────────────────────┘      └────────────────────────┘
                   ▲
                   │ PromQL query API
                   │
       ┌────────────────────────┐
       │   attendance_grafana   │
       │ (Grafana v13.2.4: 3001)│
       │  Volume: grafana_data  │
       └────────────────────────┘
```

### 8.2. Các Thành phần Giám sát

1. **Prometheus Server (`attendance_prometheus` - `prom/prometheus:v3.15.1`):**
   - Thu thập định kỳ (pull model) qua `scrape_interval: 15s`.
   - Quản lý 4 scrape jobs: `prometheus`, `cadvisor`, `nginx`, `mysql`.
   - Lưu trữ dữ liệu TSDB trên named volume `attendance_prometheus_data`.
   - Cung cấp giao diện truy vấn PromQL tại cổng `9090`.

2. **cAdvisor Container Monitoring (`attendance_cadvisor` - `ghcr.io/google/cadvisor:0.60.6`):**
   - Giám sát tài nguyên phần cứng tiêu thụ của toàn bộ Docker containers: CPU, RAM working set, Network I/O.
   - Cấu hình đặc thù tương thích Docker Desktop WSL2 (`privileged: true`, device `/dev/kmsg`, mount `/rootfs`, `/sys`, `/var/run`, `/var/lib/docker/`).
   - Xuất metrics thật gắn nhãn container: `attendance_app`, `attendance_mysql`, `attendance_nginx`, `attendance_phpmyadmin`...

3. **NGINX Prometheus Exporter (`attendance_nginx_exporter` - `nginx/nginx-prometheus-exporter:1.5.3`):**
   - Kết nối tới endpoint nội bộ `http://nginx:8080/stub_status` do Nginx phục vụ (không mở ra ngoài host).
   - Chuyển đổi trạng thái Nginx sang Prometheus metrics tại cổng nội bộ `9113`.
   - Đo lường: Active connections, accepted connections, handled connections, tổng số request HTTP và request rate.

4. **MySQL Prometheus Exporter (`attendance_mysql_exporter` - `prom/mysqld-exporter:v0.20.0`):**
   - Kết nối tới MySQL qua user chuyên dụng `exporter` với nguyên tắc đặc quyền tối thiểu (Least Privilege: `PROCESS`, `REPLICATION CLIENT`, `SELECT`).
   - Mật khẩu được nạp tự động qua biến môi trường `MYSQL_EXPORTER_PASSWORD` trong `.env` (không hardcode vào config hay file schema).
   - Khi triển khai mới (fresh deployment), file `database/init-exporter.sh` tự động được MySQL `/docker-entrypoint-initdb.d/` thực thi để khởi tạo user `exporter` khớp chính xác với `MYSQL_EXPORTER_PASSWORD` trong `.env`.
   - Đo lường: Uptime, trạng thái kết nối `mysql_up`, số lượng threads đang active, queries/s, questions/s, dữ liệu bộ đệm InnoDB Buffer Pool.

5. **Grafana Visualizations & Dashboards (`attendance_grafana` - `grafana/grafana:13.2.4`):**
   - Giao diện trực quan hóa dữ liệu tại cổng `3001`.
   - **Tự động Provisioning:**
     - Datasource Prometheus được tự động kết nối qua `grafana/provisioning/datasources/datasource.yml` (`http://prometheus:9090`).
     - Dashboard **Attendance System Monitoring** được tự động import qua `grafana/provisioning/dashboards/` từ file `attendance-monitoring.json`.
   - Không yêu cầu thao tác cấu hình thủ công trong UI sau khi khởi chạy.

---

## 9. Bảng Đường dẫn Dịch vụ & Giám sát

| Dịch vụ | URL Truy cập | Tài khoản / Quyền | Mục đích |
|---|---|---|---|
| **Website Chính** | [http://localhost](http://localhost) | `admin` / `nv001` (xem mục 6.1) | Điểm danh & Quản trị nhân sự |
| **phpMyAdmin** | [http://localhost:8080](http://localhost:8080) | `root` / cấu hình `.env` | Quản trị CSDL MySQL |
| **Prometheus Web UI** | [http://localhost:9090](http://localhost:9090) | Truy cập trực tiếp | Kiểm tra metrics & PromQL console |
| **Prometheus Targets** | [http://localhost:9090/targets](http://localhost:9090/targets) | Truy cập trực tiếp | Kiểm tra trạng thái 4 Scrape Jobs |
| **Grafana Web UI** | [http://localhost:3001](http://localhost:3001) | `admin` / cấu hình `.env` | Đăng nhập hệ thống giám sát Grafana |
| **Grafana Dashboard** | [http://localhost:3001/d/attendance-monitoring/attendance-system-monitoring](http://localhost:3001/d/attendance-monitoring/attendance-system-monitoring) | Đăng nhập Grafana | Dashboard **Attendance System Monitoring** |

*(Lưu ý: Mật khẩu quản trị Grafana `GRAFANA_ADMIN_PASSWORD` và MySQL Exporter `MYSQL_EXPORTER_PASSWORD` được bảo mật trong file `.env` cá nhân, không commit vào repository).*

---

## 10. Các Câu truy vấn PromQL Tiêu biểu trong Dashboard

### 10.1. Nhóm Container (cAdvisor)
- **Container CPU Usage (%):**
  ```promql
  sum by (name) (rate(container_cpu_usage_seconds_total{name=~"attendance_.*"}[1m])) * 100
  ```
- **Container Memory Usage (Working Set):**
  ```promql
  sum by (name) (container_memory_working_set_bytes{name=~"attendance_.*"})
  ```
- **Container Network Receive (Bytes/s):**
  ```promql
  sum by (name) (rate(container_network_receive_bytes_total{name=~"attendance_.*",interface="eth0"}[1m]))
  ```
- **Container Network Transmit (Bytes/s):**
  ```promql
  sum by (name) (rate(container_network_transmit_bytes_total{name=~"attendance_.*",interface="eth0"}[1m]))
  ```

### 10.2. Nhóm Nginx Web Server
- **Trạng thái NGINX Up (1 = UP, 0 = DOWN):**
  ```promql
  nginx_up
  ```
- **Kết nối đang hoạt động (Active Connections):**
  ```promql
  nginx_connections_active
  ```
- **Tổng số Request HTTP:**
  ```promql
  nginx_http_requests_total
  ```
- **Tốc độ Request HTTP (req/s):**
  ```promql
  rate(nginx_http_requests_total[1m])
  ```

### 10.3. Nhóm MySQL Database
- **Trạng thái MySQL Up (1 = UP, 0 = DOWN):**
  ```promql
  mysql_up
  ```
- **Thời gian hoạt động MySQL (Uptime - Giây):**
  ```promql
  mysql_global_status_uptime
  ```
- **Số lượng kết nối đang mở (Threads Connected):**
  ```promql
  mysql_global_status_threads_connected
  ```
- **Tốc độ thực thi truy vấn (Queries/s):**
  ```promql
  rate(mysql_global_status_queries[1m])
  ```
- **Bộ nhớ đệm dữ liệu InnoDB Buffer Pool (Bytes):**
  ```promql
  mysql_global_status_innodb_buffer_pool_bytes_data
  ```

### 10.4. Nhóm Prometheus System
- **Số lượng Target đang hoạt động:**
  ```promql
  sum(up{job=~"prometheus|cadvisor|nginx|mysql"})
  ```
- **Chi tiết từng Scrape Job:**
  ```promql
  up{job=~"prometheus|cadvisor|nginx|mysql"}
  ```

---

## 11. Hướng dẫn Xử lý Sự cố Giám sát (Troubleshooting)

### 11.1. Target `nginx` báo DOWN (Health: DOWN)
1. Kiểm tra container `attendance_nginx` và `attendance_nginx_exporter` có đang chạy:
   ```bash
   docker compose ps nginx nginx-exporter
   ```
2. Kiểm tra Nginx có đang listen port 8080 cho `stub_status` không:
   ```bash
   docker compose exec nginx nginx -T | grep -A 8 "stub_status"
   ```
3. Nạp lại cấu hình Nginx mà không cần restart container:
   ```bash
   docker compose exec nginx nginx -s reload
   ```

### 11.2. Target `mysql` báo DOWN (Health: DOWN)
1. Kiểm tra MySQL container đã vượt qua Healthcheck (`healthy`):
   ```bash
   docker compose ps mysql
   ```
2. Kiểm tra quyền và user `exporter` trong MySQL:
   ```bash
   docker compose exec mysql mysql -u root -p -e "SHOW GRANTS FOR 'exporter'@'%';"
   ```
3. Đảm bảo biến `MYSQL_EXPORTER_PASSWORD` trong file `.env` khớp với mật khẩu user `exporter`.

### 11.3. Target `cadvisor` báo DOWN hoặc Không hiển thị tên Container
1. Kiểm tra logs container:
   ```bash
   docker compose logs cadvisor --tail 30
   ```
2. Trên Docker Desktop (Windows/WSL2), cAdvisor cần cờ `privileged: true` và mount đầy đủ `/rootfs`, `/sys`, `/var/run`, `/var/lib/docker/` và `/dev/disk/` để ánh xạ chính xác cgroups.
3. Kiểm tra endpoint metrics:
   ```bash
   curl.exe http://localhost:8080/metrics
   ```

### 11.4. Grafana không hiển thị Dashboard hoặc báo "Data source not found"
1. Kiểm tra trạng thái datasource qua API:
   ```bash
   curl.exe -s -u admin:your_password http://localhost:3001/api/datasources
   ```
2. Kiểm tra logs provisioning của Grafana:
   ```bash
   docker compose logs grafana | grep -E "provisioning|error"
   ```
3. Đảm bảo file cấu hình `datasource.yml` và `dashboard.yml` nằm đúng thư mục mount `./grafana/provisioning/`.

---

## 12. Kiến trúc Toàn diện & Centralized Logging (Phase 3)

### 12.1. Sơ đồ Kiến trúc Tổng thể Hệ thống

Hệ thống kết hợp đồng thời 3 luồng kiến trúc (Application, Metrics Monitoring, Centralized Logging) trong 3 mạng Docker bridge cách ly:

```
                                  [ Trình duyệt / Client ]
                                              │
                         Port 80 (Public)     │       127.0.0.1:8080 (Localhost only)
                ┌─────────────────────────────┴──────────────────────────────┐
                ▼                                                            ▼
     ┌──────────────────────┐                                     ┌──────────────────────┐
     │   attendance_nginx   │                                     │ attendance_phpmyadmin│
     │    (Reverse Proxy)   │                                     │     (Port 8080)      │
     │     [web_net]        │                                     │       [db_net]       │
     └──────────┬───────────┘                                     └──────────┬───────────┘
                │ proxy_pass: http://app:3000                                │
                ▼                                                            │
     ┌──────────────────────┐                                                │
     │    attendance_app    │                                                │
     │  (Node.js, non-root) │                                                │
     │  [web_net, db_net]   │                                                │
     └──────────┬───────────┘                                                │
                │ MySQL: mysql:3306 (utf8mb4)                                │
                └─────────────────────────────┬──────────────────────────────┘
                                              ▼
                                   ┌──────────────────────┐
                                   │   attendance_mysql   │
                                   │    (MySQL 8.0 DB)    │
                                   │       [db_net]       │
                                   └──────────────────────┘

════════════════════════════════ METRICS PIPELINE ═════════════════════════════════════
   ┌──────────────────┐   ┌────────────────────────┐   ┌────────────────────────┐
   │attendance_cadvisor│   │attendance_nginx_export│   │attendance_mysql_export │
   │[monitoring_net]  │   │[web_net, monitoring_net│   │[db_net, monitoring_net]│
   └────────┬─────────┘   └───────────┬────────────┘   └───────────┬────────────┘
            │                         │                            │
            └─────────────────────────┼────────────────────────────┘
                                      ▼ (Scrape interval: 15s)
                          ┌────────────────────────┐
                          │ attendance_prometheus  │
                          │   (127.0.0.1:9090)     │
                          │   [monitoring_net]     │
                          └───────────┬────────────┘
                                      │
════════════════════════════════ LOGGING PIPELINE ═════════════════════════════════════
   ┌────────────────────────────────────────────────────────────────────────┐
   │     Tất cả Docker Containers (app, nginx, mysql, exporters, ...)       │
   └──────────────────────────────────┬─────────────────────────────────────┘
                                      │ (docker_sd_configs qua /var/run/docker.sock)
                                      ▼
                          ┌────────────────────────┐
                          │  attendance_promtail   │
                          │    (v3.6.11, Daemon)   │
                          │   [monitoring_net]     │
                          └───────────┬────────────┘
                                      │ (Push HTTP API: http://loki:3100/loki/api/v1/push)
                                      ▼
                          ┌────────────────────────┐
                          │    attendance_loki     │
                          │ (v3.6.11, Single-Bin)  │
                          │   (127.0.0.1:3100)     │
                          │   [monitoring_net]     │
                          └───────────┬────────────┘
                                      │
════════════════════════════════ VISUALIZATION ═════════════════════════════════════════
                                      ▼ (Prometheus & Loki Datasources)
                          ┌────────────────────────┐
                          │   attendance_grafana   │
                          │   (127.0.0.1:3001)     │
                          │   [monitoring_net]     │
                          └────────────────────────┘
```

### 12.2. Thành phần Logging: Loki & Promtail

- **Loki Service (`attendance_loki`):**
  - **Phiên bản:** `grafana/loki:3.6.11` (exact pin tag, tương thích hoàn toàn với Promtail 3.6.11).
  - **Mô hình triển khai:** Single-binary, lưu trữ local filesystem (`/loki/tsdb`, `/loki/wal`) tối ưu cho môi trường Lab/Dev.
  - **Schema:** TSDB v13 engine với `retention_period: 168h` (7 ngày).
  - **Cổng kết nối:** Lắng nghe nội bộ cổng `3100`, chỉ bind loopback máy chủ tại `127.0.0.1:3100:3100` để debug/kiểm tra.
  - **Persistent Volume:** `attendance_loki_data` mount tại `/loki`.
  - **Kiểm tra trạng thái sẵn sàng:** `curl.exe http://localhost:3100/ready` -> trả về `ready` (HTTP 200).

- **Promtail Service (`attendance_promtail`):**
  - **Phiên bản:** `grafana/promtail:3.6.11` (exact pin tag theo đúng rubric đề tài môn học).
  - **Thu thập log thực tế:** Sử dụng Docker Service Discovery (`docker_sd_configs`) kết nối trực tiếp socket `/var/run/docker.sock` và mount thư mục container logs `/var/lib/docker/containers:ro`.
  - **Cấu hình nhãn (Relabeling):**
    - Làm sạch tên container: bỏ ký tự `/` ở đầu (`attendance_app`, `attendance_nginx`, `attendance_mysql`...).
    - Tự động gán nhãn `service` từ Docker Compose label (`__meta_docker_container_label_com_docker_compose_service`).
    - Giữ lại nhãn luồng `stream` (`stdout`, `stderr`) và `job: docker`.
    - Lọc giữ chỉ các container của dự án (`attendance_.*`).
    - Loại trừ chính container Promtail và Loki (`attendance_(promtail|loki)`) nhằm chống hiện tượng đệ quy lặp log (log loop spam).
  - **Vị trí lưu trữ offset:** `/tmp/positions.yaml`.

> [!NOTE]
> **Ghi chú về Promtail EOL và Xu hướng Grafana Alloy:**
> Promtail đã đạt mốc End-Of-Life (EOL) từ phía Grafana Labs. Tuy nhiên, Promtail được giữ lại và sử dụng trong đồ án này nhằm đáp ứng chuẩn mực yêu cầu kỹ thuật cụ thể từ đề bài học phần. Trong các hệ thống sản xuất (Production) thế hệ mới, **Grafana Alloy** là hướng di chuyển (migration path) chính thức được Grafana Labs khuyến nghị thay thế cho Promtail.

---

## 13. Grafana Loki Datasource & Logging Dashboard

### 13.1. Provisioning Loki Datasource tự động

File cấu hình `./grafana/provisioning/datasources/datasource.yml` tự động khởi tạo đồng thời 2 nguồn dữ liệu khi Grafana khởi động, không cần thao tác tay:
1. **Prometheus:** `url: http://prometheus:9090`, `uid: prometheus`, `isDefault: true`.
2. **Loki:** `url: http://loki:3100`, `uid: loki`, `isDefault: false`, `jsonData: { maxLines: 1000 }`.

Kiểm tra sức khỏe datasource qua API:
```bash
curl.exe -s -u admin:your_password http://127.0.0.1:3001/api/datasources/uid/loki/health
# Kết quả: {"message":"Data source successfully connected.","status":"OK"}
```

### 13.2. Dashboard "Attendance System Logs"

Grafana được cấu hình nạp tự động dashboard `./grafana/provisioning/dashboards/attendance-logs.json` (UID: `attendance-system-logs`) với các panels chuyên biệt:
- **Total Log Lines ($__range):** Panel Stat đo lường tổng số dòng log thu nạp được.
- **Log Ingestion Rate by Service (1m bins):** TimeSeries biểu đồ cột thể hiện tốc độ phát sinh log phân theo từng service.
- **Node.js Application Logs:** Panel Logs hiển thị luồng log backend Express (kết nối DB, log request, đăng nhập, điểm danh).
- **NGINX Web Server Logs:** Panel Logs hiển thị access log và error log từ reverse proxy Nginx.
- **Filtered Errors & Security Logs:** Panel Logs lọc riêng các cảnh báo, lỗi runtime và các request bất thường.
- **All Attendance Containers Stream:** Panel Logs hợp nhất tất cả container của hệ thống theo thời gian thực.

---

## 14. Danh mục LogQL Queries Thực tế (Đã Kiểm thử 100%)

Các câu truy vấn LogQL sau đã được kiểm thử trực tiếp trên hệ thống thật và trả về dữ liệu chính xác:

### 14.1. Query 1: Giám sát Ứng dụng Backend (Node.js App)
- **Mục đích:** Xem toàn bộ luồng xử lý của ứng dụng Node.js (khởi động máy chủ, kết nối CSDL MySQL, các request HTTP, đăng nhập, điểm danh).
- **Cú pháp LogQL:**
  ```logql
  {service="app"}
  ```
- **Kết quả thực tế ghi nhận:**
  ```
  [HTTP] POST /api/auth/login 200 108ms
  [AUTH] Login successful: username=nv001, role=EMPLOYEE, employee_id=1
  [HTTP] POST /api/employee/check-in 409 142ms
  [HTTP] POST /api/employee/check-out 400 31ms
  ```

### 14.2. Query 2: Giám sát Reverse Proxy (NGINX Access Logs)
- **Mục đích:** Xem toàn bộ request gửi từ client đến Nginx trước khi chuyển tiếp vào backend (IP nguồn, method, URL path, HTTP status code, thời gian xử lý).
- **Cú pháp LogQL:**
  ```logql
  {service="nginx"}
  ```
- **Kết quả thực tế ghi nhận:**
  ```
  172.22.0.1 - - [23/Oct/2026:10:05:50 +0000] "POST /api/auth/login HTTP/1.1" 200 352 "-" "curl/8.13.0"
  172.22.0.1 - - [23/Oct/2026:10:05:51 +0000] "POST /api/employee/check-in HTTP/1.1" 409 98 "-" "curl/8.13.0"
  172.22.0.1 - - [23/Oct/2026:10:05:51 +0000] "POST /api/employee/check-out HTTP/1.1" 400 82 "-" "curl/8.13.0"
  ```

### 14.3. Query 3: Phát hiện Lỗi & Cảnh báo Bảo mật (Errors, Warnings, 404s)
- **Mục đích:** Lọc và phát hiện các trường hợp đăng nhập sai mật khẩu, gọi endpoint không tồn tại (404), hoặc lỗi kết nối.
- **Cú pháp LogQL:**
  ```logql
  {service=~"app|nginx"} |~ "(?i)fail|error|warn|404"
  ```
- **Kết quả thực tế ghi nhận:**
  ```
  [attendance_app] [AUTH] Login failed: username=wrong_user not found
  [attendance_app] [HTTP] GET /api/nonexistent-route 404 17ms
  [attendance_nginx] 172.22.0.1 - - "GET /api/nonexistent-route HTTP/1.1" 404 89 "-" "curl/8.13.0"
  ```

### 14.4. Query 4 (Nâng cao): Tra cứu Sự kiện Nghiệp vụ Điểm danh
- **Mục đích:** Lọc riêng các hoạt động Đăng nhập, Check-in, Check-out để kiểm toán và truy vết người dùng.
- **Cú pháp LogQL:**
  ```logql
  {service="app"} |~ "(?i)login|check-in|check-out"
  ```
- **Kết quả thực tế ghi nhận:**
  ```
  [AUTH] Login successful: username=admin, role=ADMIN, employee_id=none
  [AUTH] Login successful: username=nv001, role=EMPLOYEE, employee_id=1
  [ATTENDANCE] Check-in success: employee_id=1, shift_id=1, status=ON_TIME, time=08:00:00
  ```

---

## 15. Hệ thống Bảo mật & Gia cố (System Hardening)

Hệ thống được gia cố toàn diện với **4 biện pháp bảo mật cốt lõi** và các biện pháp bổ trợ:

### 15.1. Biện pháp 1: Thực thi Container bằng Non-Root User (Least Privilege)
- **Triển khai:** Trong `app/Dockerfile`, ứng dụng Node.js chuyển đổi sang user unprivileged `node` (`USER node`) thay vì chạy mặc định với quyền `root` (`UID 0`). Mã nguồn và thư mục `/app` được bàn giao sở hữu qua `chown -R node:node /app`.
- **Hạn chế Linux Capabilities:** Bổ sung `cap_drop: [ALL]` trong `docker-compose.yml` để loại bỏ toàn bộ các quyền nhân Linux không cần thiết.
- **Lệnh xác minh:**
  ```bash
  docker compose exec app id
  # Kết quả: uid=1000(node) gid=1000(node) groups=1000(node) -> Xác nhận UID != 0
  ```

### 15.2. Biện pháp 2: Phân đoạn Mạng Đa tầng (Multi-tier Network Segmentation)
- **Triển khai:** Thay vì để tất cả container cùng dùng chung một mạng mặc định, hệ thống phân chia làm 3 Docker bridge networks độc lập:
  1. `attendance_web_net`: Kết nối Nginx, Node.js App, Nginx Exporter.
  2. `attendance_db_net`: Kết nối Node.js App, MySQL, phpMyAdmin, MySQL Exporter.
  3. `attendance_monitoring_net`: Kết nối Prometheus, Grafana, Loki, Promtail, cAdvisor, Nginx Exporter, MySQL Exporter.
- **Hiệu quả bảo mật:**
  - Cơ sở dữ liệu MySQL nằm hoàn toàn trong `attendance_db_net`, **không có bất kỳ liên kết nào** tới `attendance_web_net` hoặc `attendance_monitoring_net`. NGINX và Grafana không thể gửi gói tin trực tiếp tới MySQL.
  - Ngăn chặn nguy cơ Lateral Movement (tấn công mở rộng vùng) nếu một tầng web proxy bị thỏa hiệp.
- **Lệnh xác minh:**
  ```bash
  docker network inspect attendance_web_net attendance_db_net attendance_monitoring_net --format '{{.Name}}: {{range $k, $v := .Containers}}{{$v.Name}} {{end}}'
  ```

### 15.3. Biện pháp 3: Ràng buộc Cổng Quản trị & Giám sát vào Localhost (`127.0.0.1`)
- **Triển khai:** Tất cả các cổng phục vụ quản trị và hạ tầng nội bộ được bind nghiêm ngặt vào địa chỉ loopback `127.0.0.1`:
  - `phpMyAdmin`: `127.0.0.1:8080:80`
  - `Prometheus`: `127.0.0.1:9090:9090`
  - `Grafana`: `127.0.0.1:3001:3000`
  - `Loki`: `127.0.0.1:3100:3100`
  - Chỉ duy nhất cổng Nginx Web Server (`80:80`) được mở public ra bên ngoài để demo và phục vụ người dùng.
- **Hiệu quả bảo mật:** Các công cụ nhạy cảm không bị lộ ra dải mạng LAN hoặc Internet, phòng chống quét cổng tự động và brute-force.
- **Lệnh xác minh:**
  ```bash
  docker compose ps
  # Cột PORTS hiển thị: 127.0.0.1:8080->80/tcp, 127.0.0.1:9090->9090/tcp, 127.0.0.1:3001->3000/tcp, 127.0.0.1:3100->3100/tcp
  ```

### 15.4. Biện pháp 4: Vô hiệu hóa Leo thang Đặc quyền (`no-new-privileges:true`)
- **Triển khai:** Áp dụng cờ an ninh `security_opt: [no-new-privileges:true]` cho các dịch vụ chính: `app`, `nginx`, `nginx-exporter`, `mysql-exporter`, `prometheus`, `grafana`, `loki`, `promtail`.
- **Hiệu quả bảo mật:** Ngăn chặn các tiến trình con bên trong container có thể lợi dụng các tệp tin thực thi mang cờ SUID/SGID để leo thang lên quyền hạn cao hơn.

### 15.5. Các Biện pháp Gia cố Bổ trợ
1. **Nginx Hardening & Security Headers:**
   - Ẩn thông tin phiên bản máy chủ: `server_tokens off;` (HTTP response header trả về `Server: nginx` thay vì để lộ số hiệu phiên bản).
   - Thiết lập đầy đủ các HTTP Security Headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Content-Security-Policy`, `X-XSS-Protection`.
2. **Kiểm soát Kích thước File Log (Log Rotation):**
   - Thiết lập logging options: `driver: json-file`, `max-size: "10m"`, `max-file: "3"` cho các container trọng yếu, ngăn chặn nguy cơ tràn ổ cứng (Disk Exhaustion DoS).
3. **Nguyên tắc Quyền tối thiểu cho Cơ sở Dữ liệu (Least Privilege Database):**
   - User `exporter` chỉ được cấp đúng 3 quyền tối thiểu: `PROCESS`, `REPLICATION CLIENT`, `SELECT`.
   - Ứng dụng nghiệp vụ chỉ sử dụng user `attendance_user`, không dùng user `root`.
4. **Bảo mật Bí mật & Thông tin Nhạy cảm (Zero Secret Leak):**
   - File cấu hình `.env` được loại trừ hoàn toàn khỏi Git qua `.gitignore`.
   - File `.env.example` chỉ chứa placeholder mẫu.
   - Không ghi log bất kỳ thông tin nào liên quan đến mật khẩu, JWT token, Authorization header hay database connection strings.

---

## 16. Hướng dẫn Khởi chạy và Kiểm tra Toàn diện

### 16.1. Khởi động Hệ thống
```bash
# 1. Sao chép biến môi trường (nếu chưa có)
cp .env.example .env

# 2. Khởi chạy toàn bộ 11 containers
docker compose up -d --build

# 3. Kiểm tra danh sách container đang hoạt động
docker compose ps
```

### 16.2. Kiểm tra Health & Trạng thái Hoạt động
- **Website chính:** `http://localhost/` (Tài khoản: `admin` / `admin123` hoặc `nv001` / `nv001123`)
- **Healthcheck backend:** `curl.exe -i http://localhost/health`
- **phpMyAdmin:** `http://localhost:8080/`
- **Prometheus UI:** `http://localhost:9090/` (Targets: `http://localhost:9090/targets`)
- **Grafana Dashboard:** `http://localhost:3001/` (Tài khoản mặc định: `admin` / mật khẩu trong `.env`)
- **Loki Status:** `curl.exe http://localhost:3100/ready`
- **Promtail Target Discovery:** `curl.exe http://localhost:3100/loki/api/v1/labels`

---

## 17. Danh mục Ảnh Minh chứng Toàn diện Cần chụp (Final Evidence Checklist)

Chuẩn bị đầy đủ các ảnh chụp màn hình sau để báo cáo hoàn thành Phase 1, Phase 2 và Phase 3:

1. **Phase 1 - Website Ứng dụng & phpMyAdmin:**
   - [ ] Giao diện Đăng nhập & Admin Dashboard (`http://localhost/`) quản lý nhân viên, ca làm.
   - [ ] Giao diện Employee Portal (`http://localhost/employee.html`) thực hiện Check-in / Check-out thành công.
   - [ ] Giao diện phpMyAdmin (`http://localhost:8080/`) kết nối CSDL `attendance_db` hiển thị dữ liệu tiếng Việt UTF-8 chuẩn.
2. **Phase 2 - Prometheus & Metrics Dashboard:**
   - [ ] Giao diện Prometheus Targets (`http://localhost:9090/targets`) hiển thị đủ **4/4 targets đều ở trạng thái UP màu xanh** (`prometheus`, `cadvisor`, `nginx`, `mysql`).
   - [ ] Dashboard Grafana **Attendance System Monitoring** (`http://localhost:3001`) hiển thị đầy đủ biểu đồ CPU/RAM cAdvisor, NGINX req/s, MySQL queries/s.
3. **Phase 3 - Centralized Logging & Loki Dashboard:**
   - [ ] Giao diện Grafana Datasources xác nhận cả 2 nguồn **Prometheus** và **Loki** đều kết nối thành công (`Status: OK`).
   - [ ] Dashboard Grafana **Attendance System Logs** hiển thị đầy đủ các panels: Total Log Lines, Log Ingestion Rate, Node.js App Logs, NGINX Logs, Filtered Errors, All Container Logs.
   - [ ] Giao diện **Grafana Explore (Loki)** thực thi thành công ít nhất 3 LogQL queries:
     - `{service="app"}`
     - `{service="nginx"}`
     - `{service=~"app|nginx"} |~ "(?i)fail|error|warn|404"`
4. **Phase 3 - Hardening & System Verification:**
   - [ ] Terminal chạy lệnh `docker compose exec app id` xác nhận container Node.js chạy với `uid=1000(node)` (Non-root, UID != 0).
   - [ ] Terminal chạy lệnh `docker compose ps` xác nhận tất cả 11 containers đều `Up` và các cổng quản trị (`8080`, `9090`, `3001`, `3100`) đều bind vào `127.0.0.1`.
   - [ ] Terminal chạy lệnh `curl.exe -i http://localhost/health` hiển thị HTTP 200 kèm các Security Headers và `Server: nginx` (đã ẩn số phiên bản qua `server_tokens off`).

