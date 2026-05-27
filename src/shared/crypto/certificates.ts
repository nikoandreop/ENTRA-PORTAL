import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CertificateConfig {
  certsDir: string;
  caCommonName: string;
  validityDays: number;
}

export function ensureCertsDirectory(certsDir: string): void {
  if (!existsSync(certsDir)) {
    mkdirSync(certsDir, { recursive: true, mode: 0o700 });
  }
}

export function generateCA(config: CertificateConfig): { caCert: string; caKey: string } {
  const { certsDir, caCommonName, validityDays } = config;
  ensureCertsDirectory(certsDir);

  const caKeyPath = join(certsDir, 'ca.key');
  const caCertPath = join(certsDir, 'ca.crt');

  if (existsSync(caCertPath) && existsSync(caKeyPath)) {
    return {
      caCert: readFileSync(caCertPath, 'utf8'),
      caKey: readFileSync(caKeyPath, 'utf8'),
    };
  }

  execSync(
    `openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-384 ` +
    `-keyout "${caKeyPath}" -out "${caCertPath}" -days ${validityDays} ` +
    `-subj "/CN=${caCommonName}/O=Entra Portal" -nodes`,
    { stdio: 'pipe' }
  );

  execSync(`chmod 600 "${caKeyPath}"`, { stdio: 'pipe' });

  return {
    caCert: readFileSync(caCertPath, 'utf8'),
    caKey: readFileSync(caKeyPath, 'utf8'),
  };
}

export function generateSignedCert(
  config: CertificateConfig,
  name: string,
  sans: string[] = []
): { cert: string; key: string } {
  const { certsDir, validityDays } = config;
  const caKeyPath = join(certsDir, 'ca.key');
  const caCertPath = join(certsDir, 'ca.crt');
  const keyPath = join(certsDir, `${name}.key`);
  const certPath = join(certsDir, `${name}.crt`);
  const csrPath = join(certsDir, `${name}.csr`);

  if (existsSync(certPath) && existsSync(keyPath)) {
    return {
      cert: readFileSync(certPath, 'utf8'),
      key: readFileSync(keyPath, 'utf8'),
    };
  }

  const sanExt = sans.length > 0
    ? `-extfile <(echo "subjectAltName=${sans.join(',')}")`
    : '';

  execSync(
    `openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-384 ` +
    `-keyout "${keyPath}" -out "${csrPath}" ` +
    `-subj "/CN=${name}/O=Entra Portal" -nodes`,
    { stdio: 'pipe', shell: '/bin/bash' }
  );

  const signCmd = sans.length > 0
    ? `openssl x509 -req -in "${csrPath}" -CA "${caCertPath}" -CAkey "${caKeyPath}" ` +
      `-CAcreateserial -out "${certPath}" -days ${validityDays} ` +
      `-extfile <(echo "subjectAltName=${sans.join(',')}")`
    : `openssl x509 -req -in "${csrPath}" -CA "${caCertPath}" -CAkey "${caKeyPath}" ` +
      `-CAcreateserial -out "${certPath}" -days ${validityDays}`;

  execSync(signCmd, { stdio: 'pipe', shell: '/bin/bash' });

  execSync(`chmod 600 "${keyPath}" && rm -f "${csrPath}"`, { stdio: 'pipe' });

  return {
    cert: readFileSync(certPath, 'utf8'),
    key: readFileSync(keyPath, 'utf8'),
  };
}
