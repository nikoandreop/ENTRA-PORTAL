import winston from 'winston';

const sanitize = winston.format((info) => {
  const sanitized = { ...info };
  const sensitiveKeys = ['password', 'secret', 'token', 'authorization', 'clientSecret', 'accessToken', 'refreshToken'];
  for (const key of sensitiveKeys) {
    if (key in sanitized) {
      sanitized[key] = '[REDACTED]';
    }
  }
  return sanitized;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    sanitize(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    process.env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.combine(winston.format.colorize(), winston.format.simple())
  ),
  defaultMeta: { service: 'entra-portal-api' },
  transports: [
    new winston.transports.Console(),
    ...(process.env.NODE_ENV === 'production'
      ? [
          new winston.transports.File({ filename: '/var/log/entra-portal/error.log', level: 'error', maxsize: 50_000_000, maxFiles: 5 }),
          new winston.transports.File({ filename: '/var/log/entra-portal/combined.log', maxsize: 100_000_000, maxFiles: 10 }),
        ]
      : []),
  ],
});
