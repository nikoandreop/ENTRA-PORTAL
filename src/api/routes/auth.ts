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
      'SELECT id, email, display_name, password_hash, role, tenant_access, mfa_enabled, mfa_secret FROM dashboard_users WHERE email = ?'
    ).get(email) as any;

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      logger.warn('Failed login attempt', { email, ip: req.ip });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
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

    res.json({ success: true, data: { message: 'Password updated' } });
  } catch (err) {
    next(err);
  }
});
