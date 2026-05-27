import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthTokenPayload, DashboardRole } from '../../shared/types/auth.js';
import { ROLE_PERMISSIONS } from '../../shared/types/auth.js';
import { logger } from '../utils/logger.js';

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE-ME-IN-PRODUCTION';

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' } });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      maxAge: '1h',
    }) as AuthTokenPayload;

    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'Token has expired' } });
    } else {
      logger.warn('Invalid token attempt', { ip: req.ip });
      res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid token' } });
    }
  }
}

export function authorize(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      return;
    }

    const userPerms = ROLE_PERMISSIONS[req.user.role];
    if (userPerms.includes('*')) {
      next();
      return;
    }

    const hasPermission = permissions.every(p => userPerms.includes(p));
    if (!hasPermission) {
      logger.warn('Authorization denied', { userId: req.user.sub, requiredPermissions: permissions, role: req.user.role });
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      return;
    }

    next();
  };
}

export function requireTenantAccess(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    return;
  }

  if (req.user.role === 'superadmin') {
    next();
    return;
  }

  const tenantId = req.params.tenantId;
  if (tenantId && !req.user.tenantAccess.includes(tenantId)) {
    res.status(403).json({ success: false, error: { code: 'TENANT_ACCESS_DENIED', message: 'No access to this tenant' } });
    return;
  }

  next();
}

export function generateToken(payload: Omit<AuthTokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
}

export function generateRefreshToken(payload: { sub: string }): string {
  return jwt.sign(payload, JWT_SECRET + ':refresh', { algorithm: 'HS256', expiresIn: '7d' });
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, JWT_SECRET + ':refresh', { algorithms: ['HS256'] }) as { sub: string };
}
