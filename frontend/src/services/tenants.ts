import { api } from './api';

export async function getTenants(params?: { search?: string; status?: string; page?: number; pageSize?: number }) {
  const { data } = await api.get('/tenants', { params });
  return data;
}

export async function getTenant(id: string) {
  const { data } = await api.get(`/tenants/${id}`);
  return data.data;
}

export async function onboardTenant(payload: {
  name: string;
  domain: string;
  entraDirectoryId: string;
  clientId: string;
  clientSecret: string;
  adminConsent: boolean;
  enabledModules: string[];
}) {
  const { data } = await api.post('/tenants', payload);
  return data.data;
}

export async function updateTenant(id: string, payload: Record<string, unknown>) {
  const { data } = await api.put(`/tenants/${id}`, payload);
  return data.data;
}

export async function offboardTenant(id: string) {
  const { data } = await api.delete(`/tenants/${id}`);
  return data.data;
}
