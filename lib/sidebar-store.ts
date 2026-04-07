import { create } from 'zustand'

type SidebarState = {
  collapsed: boolean
  mobileOpen: boolean
  toggle: () => void
  setCollapsed: (v: boolean) => void
  setMobileOpen: (v: boolean) => void
}

const STORAGE_KEY = 'garnet-sidebar-collapsed'

function getInitial(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: getInitial(),
  mobileOpen: false,
  toggle: () =>
    set((s) => {
      const next = !s.collapsed
      localStorage.setItem(STORAGE_KEY, String(next))
      return { collapsed: next }
    }),
  setCollapsed: (v) => {
    localStorage.setItem(STORAGE_KEY, String(v))
    set({ collapsed: v })
  },
  setMobileOpen: (v) => set({ mobileOpen: v }),
}))
