#!/usr/bin/env bash
set -euo pipefail

CERTS_DIR="${1:-./certs}"
CA_CN="${CA_CN:-Entra Portal CA}"
VALIDITY_DAYS="${VALIDITY_DAYS:-365}"

echo "=== Entra Portal Certificate Generator ==="
echo "Output directory: ${CERTS_DIR}"

mkdir -p "${CERTS_DIR}"
chmod 700 "${CERTS_DIR}"

# Generate CA
if [ ! -f "${CERTS_DIR}/ca.key" ]; then
  echo "Generating CA certificate..."
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-384 \
    -keyout "${CERTS_DIR}/ca.key" -out "${CERTS_DIR}/ca.crt" \
    -days "${VALIDITY_DAYS}" -subj "/CN=${CA_CN}/O=Entra Portal" -nodes 2>/dev/null
  chmod 600 "${CERTS_DIR}/ca.key"
  echo "CA certificate generated."
else
  echo "CA certificate already exists, skipping."
fi

# Generate API server certificate
if [ ! -f "${CERTS_DIR}/server.key" ]; then
  echo "Generating API server certificate..."
  openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-384 \
    -keyout "${CERTS_DIR}/server.key" -out "${CERTS_DIR}/server.csr" \
    -subj "/CN=entra-portal-api/O=Entra Portal" -nodes 2>/dev/null

  cat > "${CERTS_DIR}/server-ext.cnf" << EOF
subjectAltName = DNS:localhost,DNS:api,DNS:api.entra-portal-system.svc.cluster.local,IP:127.0.0.1
EOF

  openssl x509 -req -in "${CERTS_DIR}/server.csr" \
    -CA "${CERTS_DIR}/ca.crt" -CAkey "${CERTS_DIR}/ca.key" \
    -CAcreateserial -out "${CERTS_DIR}/server.crt" \
    -days "${VALIDITY_DAYS}" -extfile "${CERTS_DIR}/server-ext.cnf" 2>/dev/null

  chmod 600 "${CERTS_DIR}/server.key"
  rm -f "${CERTS_DIR}/server.csr" "${CERTS_DIR}/server-ext.cnf"
  echo "API server certificate generated."
else
  echo "Server certificate already exists, skipping."
fi

echo ""
echo "=== Certificates generated ==="
echo "CA:     ${CERTS_DIR}/ca.crt"
echo "Server: ${CERTS_DIR}/server.crt, ${CERTS_DIR}/server.key"
echo ""
echo "To generate agent client certs, use:"
echo "  ./scripts/generate-agent-cert.sh <tenant-id>"
