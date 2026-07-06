import { create } from 'zustand';

interface UiState {
  theme: 'light' | 'dark';
  drawerOpen: boolean;
  alertsRailOpen: boolean;
  armedPatientId: string | null;
  
  toggleTheme: () => void;
  setDrawerOpen: (open: boolean) => void;
  toggleDrawer: () => void;
  setAlertsRailOpen: (open: boolean) => void;
  toggleAlertsRail: () => void;
  setArmedPatient: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  theme: (localStorage.getItem('rpm-theme2') as 'light' | 'dark') || 'dark',
  drawerOpen: window.innerWidth > 760,
  alertsRailOpen: false,
  armedPatientId: null,

  toggleTheme: () => set((state) => {
    const nextTheme = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('rpm-theme2', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    return { theme: nextTheme };
  }),
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  toggleDrawer: () => set((state) => ({ drawerOpen: !state.drawerOpen })),
  setAlertsRailOpen: (open) => set({ alertsRailOpen: open }),
  toggleAlertsRail: () => set((state) => ({ alertsRailOpen: !state.alertsRailOpen })),
  setArmedPatient: (id) => set({ armedPatientId: id })
}));
