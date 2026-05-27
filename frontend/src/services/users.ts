import { api } from './api';

export async function getUsers(tenantId: string, params?: Record<string, string>) {
  const { data } = await api.get(`/tenants/${tenantId}/users`, { params });
  return data;
}

export async function getUser(tenantId: string, userId: string) {
  const { data } = await api.get(`/tenants/${tenantId}/users/${userId}`);
  return data.data;
}

export async function getUserStats(tenantId: string) {
  const { data } = await api.get(`/tenants/${tenantId}/users/stats`);
  return data.data;
}
