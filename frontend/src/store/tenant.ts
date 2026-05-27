import { create } from 'zustand';

interface TenantState {
  selectedTenantId: string | null;
  setSelectedTenant: (id: string | null) => void;
}

export const useTenantStore = create<TenantState>()((set) => ({
  selectedTenantId: null,
  setSelectedTenant: (id) => set({ selectedTenantId: id }),
}));
