import { api } from './api';

export async function getAgents() {
  const { data } = await api.get('/agents');
  return data.data;
}

export async function getAgent(agentId: string) {
  const { data } = await api.get(`/agents/${agentId}`);
  return data.data;
}
