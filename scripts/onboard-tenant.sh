#!/usr/bin/env bash
set -euo pipefail

TENANT_ID="${1:?Usage: $0 <tenant-id> <tenant-name>}"
TENANT_NAME="${2:?Usage: $0 <tenant-id> <tenant-name>}"
TEMPLATE_DIR="./k8s/tenant-template"

echo "=== Onboarding Tenant: ${TENANT_NAME} (${TENANT_ID}) ==="

# Generate agent certificates
./scripts/generate-agent-cert.sh "${TENANT_ID}"

# Create tenant manifests from templates
OUTPUT_DIR="./k8s/tenants/${TENANT_ID}"
mkdir -p "${OUTPUT_DIR}"

for file in "${TEMPLATE_DIR}"/*.yaml; do
  filename=$(basename "${file}")
  sed -e "s/TENANT_ID/${TENANT_ID}/g" \
      -e "s/TENANT_NAME/${TENANT_NAME}/g" \
      "${file}" > "${OUTPUT_DIR}/${filename}"
  echo "  Generated: ${OUTPUT_DIR}/${filename}"
done

echo ""
echo "=== Tenant manifests generated ==="
echo ""
echo "Next steps:"
echo "  1. Create the Graph API credentials secret:"
echo "     kubectl create secret generic graph-credentials \\"
echo "       --namespace tenant-${TENANT_ID} \\"
echo "       --from-literal=GRAPH_TENANT_ID=<azure-tenant-id> \\"
echo "       --from-literal=GRAPH_CLIENT_ID=<client-id> \\"
echo "       --from-literal=GRAPH_CLIENT_SECRET=<client-secret>"
echo ""
echo "  2. Create the agent auth secret:"
echo "     kubectl create secret generic agent-auth \\"
echo "       --namespace tenant-${TENANT_ID} \\"
echo "       --from-literal=AGENT_TOKEN=<token>"
echo ""
echo "  3. Apply the manifests:"
echo "     kubectl apply -f ${OUTPUT_DIR}/"
