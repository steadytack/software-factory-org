import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_RECENTS = 5;

interface SearchState {
  /** Most recently used search item ids, newest first. */
  recents: string[];
  /** Whether the global search modal is open. */
  modalOpen: boolean;
  pushRecent: (id: string) => void;
  clearRecents: () => void;
  setModalOpen: (open: boolean) => void;
}

/** Recent-search memory for the global search modal. Persisted to
 *  localStorage; only item ids are stored, never the items themselves. */
export const useSearchStore = create<SearchState>()(
  persist(
    (set) => ({
      recents: [],
      modalOpen: false,
      setModalOpen: (open) => set({ modalOpen: open }),
      pushRecent: (id) =>
        set((s) => ({
          recents: [id, ...s.recents.filter((r) => r !== id)].slice(
            0,
            MAX_RECENTS,
          ),
        })),
      clearRecents: () => set({ recents: [] }),
    }),
    { name: "search-recents" },
  ),
);
