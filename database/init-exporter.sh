#!/bin/sh
set -e

# ==============================================================================
# Dynamic Provisioning of Prometheus MySQL Exporter User (Phase 2)
# Executed automatically by /docker-entrypoint-initdb.d/ on fresh deployment.
# Reads MYSQL_EXPORTER_PASSWORD from container environment (from .env).
# Grants least privileges required: PROCESS, REPLICATION CLIENT, SELECT.
# ==============================================================================

if [ -n "$MYSQL_EXPORTER_PASSWORD" ]; then
    echo "==> Configuring Prometheus MySQL exporter user from MYSQL_EXPORTER_PASSWORD..."
    
    SQL_CMDS="CREATE USER IF NOT EXISTS 'exporter'@'%' IDENTIFIED BY '${MYSQL_EXPORTER_PASSWORD}';
ALTER USER 'exporter'@'%' IDENTIFIED BY '${MYSQL_EXPORTER_PASSWORD}';
GRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO 'exporter'@'%';
FLUSH PRIVILEGES;"

    if command -v docker_process_sql >/dev/null 2>&1 || type docker_process_sql >/dev/null 2>&1; then
        echo "$SQL_CMDS" | docker_process_sql
    else
        mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "$SQL_CMDS"
    fi
    
    echo "==> Prometheus MySQL exporter user configured successfully with least privileges."
else
    echo "==> WARNING: MYSQL_EXPORTER_PASSWORD is not set. Exporter user not initialized."
fi
