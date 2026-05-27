import { api } from './api';

export async function getDashboardOverview() {
  const { data } = await api.get('/dashboard/overview');
  return data.data;
}

export async function getComplianceOverview() {
  const { data } = await api.get('/dashboard/compliance');
  return data.data;
}
