/**
 * Global UI State Store
 *
 * Manages complex UI state that would otherwise require prop drilling > 2 levels.
 * Uses Zustand for lightweight, persistent state management.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Audit Progress State
interface AuditProgressState {
  activeAuditToken: string | null;
  isAuditRunning: boolean;
  lastUpdated: Date | null;
}

// Sidebar State
interface SidebarState {
  isCollapsed: boolean;
  activeSection: string | null;
}

// Proposal Viewer State
interface ProposalViewState {
  selectedTier: string | null;
  isComparing: boolean;
  expandedSections: string[];
}

// Combined Store
interface UIStore {
  // Audit Progress
  audit: AuditProgressState;
  setAuditToken: (token: string | null) => void;
  setAuditRunning: (running: boolean) => void;

  // Sidebar
  sidebar: SidebarState;
  toggleSidebar: () => void;
  setActiveSection: (section: string | null) => void;

  // Proposal Viewer
  proposal: ProposalViewState;
  setSelectedTier: (tier: string | null) => void;
  toggleCompare: () => void;
  toggleSection: (sectionId: string) => void;

  // Global Loading
  isLoading: boolean;
  setLoading: (loading: boolean) => void;

  // Error State
  error: { message: string; code?: string } | null;
  setError: (error: { message: string; code?: string } | null) => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      // Audit Progress
      audit: {
        activeAuditToken: null,
        isAuditRunning: false,
        lastUpdated: null,
      },
      setAuditToken: (token) =>
        set((state) => ({
          audit: { ...state.audit, activeAuditToken: token },
        })),
      setAuditRunning: (running) =>
        set((state) => ({
          audit: { ...state.audit, isAuditRunning: running, lastUpdated: new Date() },
        })),

      // Sidebar
      sidebar: {
        isCollapsed: false,
        activeSection: null,
      },
      toggleSidebar: () =>
        set((state) => ({
          sidebar: { ...state.sidebar, isCollapsed: !state.sidebar.isCollapsed },
        })),
      setActiveSection: (section) =>
        set((state) => ({
          sidebar: { ...state.sidebar, activeSection: section },
        })),

      // Proposal Viewer
      proposal: {
        selectedTier: null,
        isComparing: false,
        expandedSections: [],
      },
      setSelectedTier: (tier) =>
        set((state) => ({
          proposal: { ...state.proposal, selectedTier: tier },
        })),
      toggleCompare: () =>
        set((state) => ({
          proposal: { ...state.proposal, isComparing: !state.proposal.isComparing },
        })),
      toggleSection: (sectionId) =>
        set((state) => ({
          proposal: {
            ...state.proposal,
            expandedSections: state.proposal.expandedSections.includes(sectionId)
              ? state.proposal.expandedSections.filter((id) => id !== sectionId)
              : [...state.proposal.expandedSections, sectionId],
          },
        })),

      // Global Loading
      isLoading: false,
      setLoading: (loading) => set({ isLoading: loading }),

      // Error State
      error: null,
      setError: (error) => set({ error }),
    }),
    {
      name: 'claraud-ui-storage',
      partialize: (state) => ({
        sidebar: state.sidebar,
        proposal: state.proposal,
      }),
    }
  )
);

// Selectors for performance optimization
export const selectIsAuditRunning = (state: UIStore) => state.audit.isAuditRunning;
export const selectSidebarCollapsed = (state: UIStore) => state.sidebar.isCollapsed;
export const selectActiveSection = (state: UIStore) => state.sidebar.activeSection;
export const selectSelectedTier = (state: UIStore) => state.proposal.selectedTier;
export const selectIsComparing = (state: UIStore) => state.proposal.isComparing;
export const selectExpandedSections = (state: UIStore) => state.proposal.expandedSections;
export const selectIsLoading = (state: UIStore) => state.isLoading;
export const selectError = (state: UIStore) => state.error;
