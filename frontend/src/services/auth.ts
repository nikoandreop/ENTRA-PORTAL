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
