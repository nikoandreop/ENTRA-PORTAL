import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { getDb } from '../models/database.js';
import { authenticate, generateToken, generateRefreshToken, verifyRefreshToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/error-handler.js';
import { logger } from '../utils/logger.js';
import { AUTH_RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from '../../shared/constants/index.js';
import { auditFromRequest, recordAudit } from '../services/audit.js';
import { v4 as uuidv4 } from 'uuid';
import { isSsoConfigured, getAuthorizationUrl, handleCallback } from '../services/microsoft-sso.js';

const ssoSessions = new Map<string, { codeVerifier: string; nonce: string; createdAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, session] of ssoSessions) {
    if (now - session.createdAt > 600_000) ssoSessions.delete(key);
  }
}, 60_000);

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().optional(),
});

const authLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: AUTH_RATE_LIMIT_MAX_REQUESTS,
  message: { success: false, error: { code: 'AUTH_RATE_LIMITED', message: 'Too many login attempts' } },
});

authRouter.post('/login', authLimiter, validate(loginSchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const db = getDb();

    const user = db.prepare(
      'SELECT id, email, display_name, password_hash, role, tenant_access, mfa_enabled, mfa_secret, auth_provider FROM dashboard_users WHERE email = ?'
    ).get(email) as any;

    if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
      logger.warn('Failed login attempt', { email, ip: req.ip });
      recordAudit({
        category: 'auth',
        action: 'login.failed',
        initiatedBy: email,
        result: 'failure',
        details: { reason: 'invalid_credentials' },
        ipAddress: req.ip || req.socket.remoteAddress,
      });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    if (user.auth_provider !== 'local') {
      recordAudit({
        category: 'auth',
        action: 'login.failed',
        initiatedBy: email,
        result: 'failure',
        details: { reason: 'sso_user_cannot_use_password', provider: user.auth_provider },
        ipAddress: req.ip || req.socket.remoteAddress,
      });
      throw new AppError(401, 'SSO_REQUIRED', 'This account uses Microsoft SSO. Please sign in with Microsoft.');
    }

    db.prepare('UPDATE dashboard_users SET last_login = datetime(\'now\') WHERE id = ?').run(user.id);

    const tenantAccess = JSON.parse(user.tenant_access);
    const accessToken = generateToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantAccess,
    });

    const refreshToken = generateRefreshToken({ sub: user.id });

    recordAudit({
      category: 'auth',
      action: 'login.success',
      initiatedBy: user.email,
      result: 'success',
      details: { method: 'local', userId: user.id },
      ipAddress: req.ip || req.socket.remoteAddress,
    });
    logger.info('User logged in', { userId: user.id, email: user.email });

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        expiresIn: 3600,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          role: user.role,
          tenantAccess,
          mfaEnabled: !!user.mfa_enabled,
          lastLogin: new Date().toISOString(),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError(400, 'MISSING_TOKEN', 'Refresh token required');

    const payload = verifyRefreshToken(refreshToken);
    const db = getDb();
    const user = db.prepare(
      'SELECT id, email, display_name, role, tenant_access, mfa_enabled FROM dashboard_users WHERE id = ?'
    ).get(payload.sub) as any;

    if (!user) throw new AppError(401, 'USER_NOT_FOUND', 'User no longer exists');

    const tenantAccess = JSON.parse(user.tenant_access);
    const accessToken = generateToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantAccess,
    });

    const newRefreshToken = generateRefreshToken({ sub: user.id });

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: 3600,
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', authenticate, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const user = db.prepare(
      'SELECT id, email, display_name, role, tenant_access, mfa_enabled, last_login, created_at FROM dashboard_users WHERE id = ?'
    ).get(req.user!.sub) as any;

    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        tenantAccess: JSON.parse(user.tenant_access),
        mfaEnabled: !!user.mfa_enabled,
        lastLogin: user.last_login,
        createdAt: user.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.put('/password', authenticate, (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) throw new AppError(400, 'MISSING_FIELDS', 'Current and new password required');
    if (newPassword.length < 12) throw new AppError(400, 'WEAK_PASSWORD', 'Password must be at least 12 characters');

    const db = getDb();
    const user = db.prepare('SELECT password_hash FROM dashboard_users WHERE id = ?').get(req.user!.sub) as any;

    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      throw new AppError(401, 'INVALID_PASSWORD', 'Current password is incorrect');
    }

    const hash = bcrypt.hashSync(newPassword, 12);
    db.prepare('UPDATE dashboard_users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?').run(hash, req.user!.sub);

    auditFromRequest(req, 'auth', 'password.changed', { targetResources: [req.user!.sub] });

    res.json({ success: true, data: { message: 'Password updated' } });
  } catch (err) {
    next(err);
  }
});

// Microsoft SSO endpoints

authRouter.get('/sso/config', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: { enabled: isSsoConfigured() },
  });
});

authRouter.get('/sso/authorize', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isSsoConfigured()) {
      throw new AppError(400, 'SSO_NOT_CONFIGURED', 'Microsoft SSO is not configured');
    }

    const state = uuidv4();
    const { url, codeVerifier, nonce } = await getAuthorizationUrl(state);

    ssoSessions.set(state, { codeVerifier, nonce, createdAt: Date.now() });

    res.json({ success: true, data: { authorizationUrl: url, state } });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/sso/callback', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, state } = req.body;
    if (!code || !state) throw new AppError(400, 'MISSING_PARAMS', 'Authorization code and state are required');

    const session = ssoSessions.get(state);
    if (!session) throw new AppError(400, 'INVALID_STATE', 'Invalid or expired SSO session');
    ssoSessions.delete(state);

    const ssoUser = await handleCallback(code, state, session.codeVerifier, session.nonce);

    const db = getDb();
    let user = db.prepare(
      'SELECT id, email, display_name, role, tenant_access, mfa_enabled, auth_provider, entra_oid FROM dashboard_users WHERE entra_oid = ? OR email = ?'
    ).get(ssoUser.oid, ssoUser.email) as any;

    if (!user) {
      const id = uuidv4();
      db.prepare(
        `INSERT INTO dashboard_users (id, email, display_name, role, tenant_access, auth_provider, entra_oid, entra_tenant_id, last_login)
         VALUES (?, ?, ?, 'viewer', '[]', 'microsoft', ?, ?, datetime('now'))`
      ).run(id, ssoUser.email, ssoUser.displayName, ssoUser.oid, ssoUser.tenantId);

      user = db.prepare('SELECT id, email, display_name, role, tenant_access, mfa_enabled FROM dashboard_users WHERE id = ?').get(id) as any;

      recordAudit({
        category: 'auth',
        action: 'sso.user_provisioned',
        initiatedBy: ssoUser.email,
        result: 'success',
        details: { method: 'microsoft_sso', entraOid: ssoUser.oid, entraDirectoryId: ssoUser.tenantId },
        ipAddress: req.ip || req.socket.remoteAddress,
      });
      logger.info('SSO user auto-provisioned', { email: ssoUser.email, oid: ssoUser.oid });
    } else {
      db.prepare(
        `UPDATE dashboard_users SET display_name = ?, entra_oid = ?, entra_tenant_id = ?, auth_provider = 'microsoft', last_login = datetime('now'), updated_at = datetime('now') WHERE id = ?`
      ).run(ssoUser.displayName, ssoUser.oid, ssoUser.tenantId, user.id);
    }

    const tenantAccess = JSON.parse(user.tenant_access);
    const accessToken = generateToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantAccess,
    });
    const refreshToken = generateRefreshToken({ sub: user.id });

    recordAudit({
      category: 'auth',
      action: 'login.success',
      initiatedBy: user.email,
      result: 'success',
      details: { method: 'microsoft_sso', entraOid: ssoUser.oid, entraDirectoryId: ssoUser.tenantId },
      ipAddress: req.ip || req.socket.remoteAddress,
    });
    logger.info('SSO login', { userId: user.id, email: user.email });

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        expiresIn: 3600,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          role: user.role,
          tenantAccess,
          mfaEnabled: !!user.mfa_enabled,
          lastLogin: new Date().toISOString(),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});
