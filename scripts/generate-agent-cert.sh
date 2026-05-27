#!/usr/bin/env bash
set -euo pipefail

TENANT_ID="${1:?Usage: $0 <tenant-id>}"
CERTS_DIR="${CERTS_DIR:-./certs}"
VALIDITY_DAYS="${VALIDITY_DAYS:-365}"

if [ ! -f "${CERTS_DIR}/ca.key" ]; then
  echo "Error: CA not found. Run generate-certs.sh first."
  exit 1
fi

AGENT_DIR="${CERTS_DIR}/agents/${TENANT_ID}"
mkdir -p "${AGENT_DIR}"

echo "Generating client certificate for tenant: ${TENANT_ID}"

openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-384 \
  -keyout "${AGENT_DIR}/client.key" -out "${AGENT_DIR}/client.csr" \
  -subj "/CN=${TENANT_ID}/O=Entra Portal Agent" -nodes 2>/dev/null

openssl x509 -req -in "${AGENT_DIR}/client.csr" \
  -CA "${CERTS_DIR}/ca.crt" -CAkey "${CERTS_DIR}/ca.key" \
  -CAcreateserial -out "${AGENT_DIR}/client.crt" \
  -days "${VALIDITY_DAYS}" 2>/dev/null

chmod 600 "${AGENT_DIR}/client.key"
rm -f "${AGENT_DIR}/client.csr"

cp "${CERTS_DIR}/ca.crt" "${AGENT_DIR}/ca.crt"

echo "Agent certificates generated at: ${AGENT_DIR}/"
echo "  client.crt, client.key, ca.crt"
