import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, execute } from '../models/query.js';
import { getDb } from '../models/database.js';
import { authenticate, generateToken, generateRefreshToken, verifyRefreshToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/error-handler.js';
import { logger } from '../utils/logger.js';
import { AUTH_RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from '../../shared/constants/index.js';
import { auditFromRequest, recordAudit } from '../services/audit.js';
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

authRouter.post('/login', authLimiter, validate(loginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const user = await queryOne(
      'SELECT id, email, display_name, password_hash, role, tenant_access, mfa_enabled, mfa_secret, auth_provider FROM dashboard_users WHERE email = $1',
      [email],
    );

    if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
      await recordAudit({ category: 'auth', action: 'login.failed', initiatedBy: email, result: 'failure', details: { reason: 'invalid_credentials' }, ipAddress: req.ip || req.socket.remoteAddress });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    if (user.auth_provider !== 'local') {
      await recordAudit({ category: 'auth', action: 'login.failed', initiatedBy: email, result: 'failure', details: { reason: 'sso_only' }, ipAddress: req.ip || req.socket.remoteAddress });
      throw new AppError(401, 'SSO_REQUIRED', 'This account uses Microsoft SSO. Please sign in with Microsoft.');
    }

    await getDb().query('UPDATE dashboard_users SET last_login = NOW() WHERE id = $1', [user.id]);
    const tenantAccess = typeof user.tenant_access === 'string' ? JSON.parse(user.tenant_access) : user.tenant_access;
    const accessToken = generateToken({ sub: user.id, email: user.email, role: user.role, tenantAccess });
    const refreshToken = generateRefreshToken({ sub: user.id });

    await recordAudit({ category: 'auth', action: 'login.success', initiatedBy: user.email, result: 'success', details: { method: 'local', userId: user.id }, ipAddress: req.ip || req.socket.remoteAddress });

    res.json({
      success: true,
      data: {
        accessToken, refreshToken, expiresIn: 3600,
        user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role, tenantAccess, mfaEnabled: !!user.mfa_enabled, lastLogin: new Date().toISOString() },
      },
    });
  } catch (err) { next(err); }
});

authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError(400, 'MISSING_TOKEN', 'Refresh token required');
    const payload = verifyRefreshToken(refreshToken);
    const user = await queryOne('SELECT id, email, display_name, role, tenant_access, mfa_enabled FROM dashboard_users WHERE id = $1', [payload.sub]);
    if (!user) throw new AppError(401, 'USER_NOT_FOUND', 'User no longer exists');
    const tenantAccess = typeof user.tenant_access === 'string' ? JSON.parse(user.tenant_access) : user.tenant_access;
    const accessToken = generateToken({ sub: user.id, email: user.email, role: user.role, tenantAccess });
    const newRefreshToken = generateRefreshToken({ sub: user.id });
    res.json({ success: true, data: { accessToken, refreshToken: newRefreshToken, expiresIn: 3600 } });
  } catch (err) { next(err); }
});

authRouter.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await queryOne('SELECT id, email, display_name, role, tenant_access, mfa_enabled, auth_provider, last_login, created_at FROM dashboard_users WHERE id = $1', [req.user!.sub]);
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    const tenantAccess = typeof user.tenant_access === 'string' ? JSON.parse(user.tenant_access) : user.tenant_access;
    res.json({ success: true, data: { id: user.id, email: user.email, displayName: user.display_name, role: user.role, tenantAccess, mfaEnabled: !!user.mfa_enabled, authProvider: user.auth_provider, lastLogin: user.last_login, createdAt: user.created_at } });
  } catch (err) { next(err); }
});

authRouter.put('/password', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) throw new AppError(400, 'MISSING_FIELDS', 'Current and new password required');
    if (newPassword.length < 12) throw new AppError(400, 'WEAK_PASSWORD', 'Password must be at least 12 characters');
    const user = await queryOne('SELECT password_hash, auth_provider FROM dashboard_users WHERE id = $1', [req.user!.sub]);
    if (user?.auth_provider !== 'local') throw new AppError(400, 'SSO_ACCOUNT', 'SSO accounts cannot change password here');
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) throw new AppError(401, 'INVALID_PASSWORD', 'Current password is incorrect');
    const hash = bcrypt.hashSync(newPassword, 12);
    await getDb().query('UPDATE dashboard_users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user!.sub]);
    await auditFromRequest(req, 'auth', 'password.changed', { targetResources: [req.user!.sub] });
    res.json({ success: true, data: { message: 'Password updated' } });
  } catch (err) { next(err); }
});

authRouter.get('/sso/config', (_req, res) => {
  res.json({ success: true, data: { enabled: isSsoConfigured() } });
});

authRouter.get('/sso/authorize', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isSsoConfigured()) throw new AppError(400, 'SSO_NOT_CONFIGURED', 'Microsoft SSO is not configured');
    const state = uuidv4();
    const { url, codeVerifier, nonce } = await getAuthorizationUrl(state);
    ssoSessions.set(state, { codeVerifier, nonce, createdAt: Date.now() });
    res.json({ success: true, data: { authorizationUrl: url, state } });
  } catch (err) { next(err); }
});

authRouter.post('/sso/callback', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, state } = req.body;
    if (!code || !state) throw new AppError(400, 'MISSING_PARAMS', 'Code and state required');
    const session = ssoSessions.get(state);
    if (!session) throw new AppError(400, 'INVALID_STATE', 'Invalid or expired SSO session');
    ssoSessions.delete(state);

    const ssoUser = await handleCallback(code, state, session.codeVerifier, session.nonce);
    const db = getDb();
    let user = await queryOne('SELECT id, email, display_name, role, tenant_access, mfa_enabled FROM dashboard_users WHERE entra_oid = $1 OR email = $2', [ssoUser.oid, ssoUser.email]);

    if (!user) {
      const id = uuidv4();
      await db.query(`INSERT INTO dashboard_users (id, email, display_name, role, tenant_access, auth_provider, entra_oid, entra_tenant_id, last_login) VALUES ($1,$2,$3,'viewer','[]','microsoft',$4,$5,NOW())`, [id, ssoUser.email, ssoUser.displayName, ssoUser.oid, ssoUser.tenantId]);
      user = await queryOne('SELECT id, email, display_name, role, tenant_access, mfa_enabled FROM dashboard_users WHERE id = $1', [id]);
      await recordAudit({ category: 'auth', action: 'sso.user_provisioned', initiatedBy: ssoUser.email, result: 'success', details: { entraOid: ssoUser.oid }, ipAddress: req.ip || req.socket.remoteAddress });
    } else {
      await db.query(`UPDATE dashboard_users SET display_name=$1, entra_oid=$2, entra_tenant_id=$3, auth_provider='microsoft', last_login=NOW(), updated_at=NOW() WHERE id=$4`, [ssoUser.displayName, ssoUser.oid, ssoUser.tenantId, user.id]);
    }

    const tenantAccess = typeof user!.tenant_access === 'string' ? JSON.parse(user!.tenant_access) : user!.tenant_access;
    const accessToken = generateToken({ sub: user!.id, email: user!.email, role: user!.role, tenantAccess });
    const refreshToken = generateRefreshToken({ sub: user!.id });
    await recordAudit({ category: 'auth', action: 'login.success', initiatedBy: user!.email, result: 'success', details: { method: 'microsoft_sso' }, ipAddress: req.ip || req.socket.remoteAddress });

    res.json({
      success: true,
      data: {
        accessToken, refreshToken, expiresIn: 3600,
        user: { id: user!.id, email: user!.email, displayName: user!.display_name, role: user!.role, tenantAccess, mfaEnabled: !!user!.mfa_enabled, lastLogin: new Date().toISOString() },
      },
    });
  } catch (err) { next(err); }
});

// Dashboard user management (admin/superadmin only)

authRouter.get('/users', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'superadmin' && req.user!.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Only admins can manage users');
    }
    const users = await queryAll(
      'SELECT id, email, display_name, role, tenant_access, mfa_enabled, auth_provider, last_login, created_at FROM dashboard_users ORDER BY created_at',
      [],
    );
    res.json({
      success: true,
      data: users.map((u: any) => ({
        id: u.id,
        email: u.email,
        displayName: u.display_name,
        role: u.role,
        tenantAccess: typeof u.tenant_access === 'string' ? JSON.parse(u.tenant_access) : u.tenant_access,
        mfaEnabled: !!u.mfa_enabled,
        authProvider: u.auth_provider,
        lastLogin: u.last_login,
        createdAt: u.created_at,
      })),
    });
  } catch (err) { next(err); }
});

const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(100),
  role: z.enum(['superadmin', 'admin', 'operator', 'viewer']),
  password: z.string().min(12),
  tenantAccess: z.array(z.string()).optional(),
});

authRouter.post('/users', authenticate, validate(createUserSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'superadmin' && req.user!.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Only admins can create users');
    }
    if (req.body.role === 'superadmin' && req.user!.role !== 'superadmin') {
      throw new AppError(403, 'FORBIDDEN', 'Only superadmins can create superadmin users');
    }

    const existing = await queryOne('SELECT id FROM dashboard_users WHERE email = $1', [req.body.email]);
    if (existing) throw new AppError(409, 'USER_EXISTS', 'A user with this email already exists');

    const id = uuidv4();
    const hash = bcrypt.hashSync(req.body.password, 12);
    const tenantAccess = JSON.stringify(req.body.tenantAccess || []);

    await getDb().query(
      `INSERT INTO dashboard_users (id, email, display_name, password_hash, role, tenant_access, auth_provider)
       VALUES ($1, $2, $3, $4, $5, $6, 'local')`,
      [id, req.body.email, req.body.displayName, hash, req.body.role, tenantAccess],
    );

    await auditFromRequest(req, 'settings', 'user.created', {
      targetResources: [id, req.body.email],
      details: { role: req.body.role },
    });

    res.status(201).json({ success: true, data: { id, email: req.body.email, role: req.body.role } });
  } catch (err) { next(err); }
});

authRouter.delete('/users/:userId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'superadmin' && req.user!.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Only admins can delete users');
    }
    if (req.params.userId === req.user!.sub) {
      throw new AppError(400, 'CANNOT_DELETE_SELF', 'Cannot delete your own account');
    }

    const target = await queryOne('SELECT id, email, role FROM dashboard_users WHERE id = $1', [req.params.userId]);
    if (!target) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    if (target.role === 'superadmin' && req.user!.role !== 'superadmin') {
      throw new AppError(403, 'FORBIDDEN', 'Only superadmins can delete superadmin users');
    }

    await execute('DELETE FROM dashboard_users WHERE id = $1', [req.params.userId]);

    await auditFromRequest(req, 'settings', 'user.deleted', {
      targetResources: [req.params.userId, target.email],
    });

    res.json({ success: true, data: { message: 'User deleted' } });
  } catch (err) { next(err); }
});
