import { api } from './api';

export async function login(email: string, password: string) {
  const { data } = await api.post('/auth/login', { email, password });
  return data.data;
}

export async function refreshToken(token: string) {
  const { data } = await api.post('/auth/refresh', { refreshToken: token });
  return data.data;
}

export async function getMe() {
  const { data } = await api.get('/auth/me');
  return data.data;
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const { data } = await api.put('/auth/password', { currentPassword, newPassword });
  return data.data;
}

export async function getSsoConfig() {
  const { data } = await api.get('/auth/sso/config');
  return data.data as { enabled: boolean };
}

export async function startSsoLogin() {
  const { data } = await api.get('/auth/sso/authorize');
  return data.data as { authorizationUrl: string; state: string };
}

export async function completeSsoLogin(code: string, state: string) {
  const { data } = await api.post('/auth/sso/callback', { code, state });
  return data.data;
}
