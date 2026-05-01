/**
 * Zustand store for the RFP Analyzer.
 *
 * Persisted slice (localStorage):
 *   - property name
 *   - globals (discount rate, LC%, shell cost, LC structure, horizon)
 *   - scenarios (array, each with id + inputs)
 *   - comparison (which two scenario IDs are A and B)
 *
 * Transient slice (in-memory only):
 *   - holdNer (the Hold-NER mode toggle/target/free-var/scenario)
 *
 * Why split? If Hold-NER were persisted, refreshing the browser could trap
 * you in solver mode with a stale free variable. UI mode lives in memory.
 */

"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Deal } from "./deals";
import type { Globals, ScenarioInputs } from "./types";
import type { FreeVariable } from "./solver";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_GLOBALS: Globals = {
  discountRate: 0.08,
  lcLLRepPercent: 0.045,
  lcTenantRepPercent: 0.045,
  shellCostPSF: 140,
  lcStructure: "split50",
  lcCalculation: "tiered",
  horizonMonths: 204,
};

/** Reasonable starting inputs — based on spec §12. User edits via the UI. */
const seedInputs = (name: string, override: Partial<ScenarioInputs> = {}): ScenarioInputs => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    name,
    projectSF: 300_000,
    buildingSF: 300_000,
    proposedLeaseSF: 300_000,
    baseRatePSF: 7,
    escalation: 0.03,
    tiAllowancePSF: 5,
    freeRentMonths: 4,
    leaseTermMonths: 125,
    leaseCommencement: today,
    leaseExecutionDate: today,
    tiDurationMonths: 1,
    ...override,
  };
};

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `s_${Math.random().toString(36).slice(2)}_${Date.now()}`;

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface ScenarioRecord {
  id: string;
  inputs: ScenarioInputs;
}

interface HoldNerState {
  enabled: boolean;
  targetNER: number;
  freeVar: FreeVariable;
  scenarioId: string;
}

interface PersistedState {
  property: { name: string };
  globals: Globals;
  scenarios: ScenarioRecord[];
  comparison: { aId: string; bId: string };
  /**
   * User-uploaded deals from a CSV. Lives only in this browser's
   * localStorage — never sent to the server, never committed to the repo.
   */
  deals: Deal[];
}

interface Actions {
  // Property + globals
  setPropertyName: (name: string) => void;
  updateGlobals: (patch: Partial<Globals>) => void;

  // Scenarios
  addScenario: (name?: string) => string;
  renameScenario: (id: string, name: string) => void;
  duplicateScenario: (id: string) => string;
  deleteScenario: (id: string) => void;
  updateInput: <K extends keyof ScenarioInputs>(id: string, key: K, value: ScenarioInputs[K]) => void;

  // Comparison
  setComparisonA: (id: string) => void;
  setComparisonB: (id: string) => void;

  // Deals (user-uploaded CSV)
  setDeals: (deals: Deal[]) => void;
  clearDeals: () => void;

  // Hold-NER (transient)
  holdNer: HoldNerState | null;
  setHoldNer: (state: HoldNerState | null) => void;
}

export type AppStore = PersistedState & Actions;

// ---------------------------------------------------------------------------
// Initial scenarios (only used on first load — persistence overrides)
// ---------------------------------------------------------------------------

function makeInitialState(): PersistedState {
  const uw: ScenarioRecord = { id: newId(), inputs: seedInputs("UW") };
  const proposal: ScenarioRecord = {
    id: newId(),
    inputs: seedInputs("Proposal", {
      baseRatePSF: 8,
      escalation: 0.04,
      tiAllowancePSF: 10,
      freeRentMonths: 6,
      leaseTermMonths: 130,
    }),
  };
  return {
    property: { name: "" },
    globals: DEFAULT_GLOBALS,
    deals: [],
    scenarios: [uw, proposal],
    comparison: { aId: uw.id, bId: proposal.id },
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      ...makeInitialState(),
      holdNer: null,

      setPropertyName: (name) => set({ property: { name } }),

      updateGlobals: (patch) =>
        set((s) => ({ globals: { ...s.globals, ...patch } })),

      addScenario: (name = "Scenario") => {
        const id = newId();
        set((s) => {
          // Auto-suffix "Scenario", "Scenario 2", "Scenario 3" if duplicates.
          const taken = new Set(s.scenarios.map((sc) => sc.inputs.name));
          let finalName = name;
          let n = 2;
          while (taken.has(finalName)) finalName = `${name} ${n++}`;
          return {
            scenarios: [...s.scenarios, { id, inputs: seedInputs(finalName) }],
          };
        });
        return id;
      },

      renameScenario: (id, name) =>
        set((s) => ({
          scenarios: s.scenarios.map((sc) =>
            sc.id === id ? { ...sc, inputs: { ...sc.inputs, name } } : sc,
          ),
        })),

      duplicateScenario: (id) => {
        const newScenarioId = newId();
        set((s) => {
          const source = s.scenarios.find((sc) => sc.id === id);
          if (!source) return {};
          const copy: ScenarioRecord = {
            id: newScenarioId,
            inputs: { ...source.inputs, name: `${source.inputs.name} (copy)` },
          };
          return { scenarios: [...s.scenarios, copy] };
        });
        return newScenarioId;
      },

      deleteScenario: (id) =>
        set((s) => {
          const remaining = s.scenarios.filter((sc) => sc.id !== id);
          // Don't allow zero scenarios; keep at least one.
          if (remaining.length === 0) return {};

          // Repair comparison if a deleted scenario was selected.
          const fallback = remaining[0]!.id;
          const aId = s.comparison.aId === id ? fallback : s.comparison.aId;
          const bIdRaw = s.comparison.bId === id ? fallback : s.comparison.bId;
          // If A and B collide, point B at any other scenario if available.
          const bId =
            bIdRaw === aId && remaining.length > 1
              ? remaining.find((sc) => sc.id !== aId)!.id
              : bIdRaw;
          return {
            scenarios: remaining,
            comparison: { aId, bId },
          };
        }),

      updateInput: (id, key, value) =>
        set((s) => ({
          scenarios: s.scenarios.map((sc) =>
            sc.id === id ? { ...sc, inputs: { ...sc.inputs, [key]: value } } : sc,
          ),
        })),

      setComparisonA: (id) =>
        set((s) => ({ comparison: { ...s.comparison, aId: id } })),

      setComparisonB: (id) =>
        set((s) => ({ comparison: { ...s.comparison, bId: id } })),

      setDeals: (deals) => set({ deals }),
      clearDeals: () => set({ deals: [] }),

      setHoldNer: (holdNer) => set({ holdNer }),
    }),
    {
      name: "lease-calculator/v1",
      // Persist all five data slices; holdNer stays in memory.
      partialize: (state) => ({
        property: state.property,
        globals: state.globals,
        scenarios: state.scenarios,
        comparison: state.comparison,
        deals: state.deals,
      }),
      version: 8,
      // v1 → v2: scenarios gain leaseExecutionDate (defaulted to commencement,
      //          which keeps the calc identical to before) and tiDurationMonths
      //          (= 1, the original single-lump TI behavior).
      // v2 → v3: globals gain lcCalculation (= "tiered", which preserves the
      //          existing split-tier LC formula).
      // v3 → v4: scenarios gain optional escalationFloor / escalationCap /
      //          rentScheduleOverride. All optional with no-op defaults; the
      //          version bump alone forces a re-hydration so types match.
      // v4 → v5: scenarios gain optional freeRentStartMonth (default 1, which
      //          preserves the original front-loaded abatement behavior).
      // v5 → v6: globals.lcPercent splits into lcLLRepPercent +
      //          lcTenantRepPercent (50/50 of the prior total). The calc
      //          engine continues to consume the sum, so headline numbers
      //          are preserved exactly.
      // v6 → v7: scenarios gain optional `dealCode` (audit trail of which
      //          CSV deal was loaded). Optional with no-op default; the
      //          version bump alone forces re-hydration so types match.
      // v7 → v8: persisted state gains `deals: Deal[]` for user-uploaded
      //          CSV. Backfill empty array — the deals.csv file used to live
      //          in the repo; users now upload it in the browser, so
      //          previously-loaded data simply isn't there.
      migrate: (persisted, version) => {
        const state = persisted as Partial<PersistedState> | undefined;
        if (state && version < 2 && state.scenarios) {
          state.scenarios = state.scenarios.map((sc) => ({
            ...sc,
            inputs: {
              ...sc.inputs,
              leaseExecutionDate:
                (sc.inputs as Partial<ScenarioInputs>).leaseExecutionDate ??
                sc.inputs.leaseCommencement,
              tiDurationMonths:
                (sc.inputs as Partial<ScenarioInputs>).tiDurationMonths ?? 1,
            },
          }));
        }
        if (state && version < 3 && state.globals) {
          state.globals = {
            ...state.globals,
            lcCalculation:
              (state.globals as Partial<Globals>).lcCalculation ?? "tiered",
          };
        }
        if (state && version < 5 && state.scenarios) {
          state.scenarios = state.scenarios.map((sc) => ({
            ...sc,
            inputs: {
              ...sc.inputs,
              freeRentStartMonth:
                (sc.inputs as Partial<ScenarioInputs>).freeRentStartMonth ?? 1,
            },
          }));
        }
        if (state && version < 6 && state.globals) {
          const old = state.globals as Partial<Globals> & { lcPercent?: number };
          if (old.lcPercent != null) {
            const total = old.lcPercent;
            state.globals = {
              ...state.globals,
              lcLLRepPercent: total / 2,
              lcTenantRepPercent: total / 2,
            };
            delete (state.globals as { lcPercent?: number }).lcPercent;
          } else {
            // No prior lcPercent (corrupt or fresh) — fall back to defaults.
            state.globals = {
              ...state.globals,
              lcLLRepPercent: state.globals.lcLLRepPercent ?? 0.045,
              lcTenantRepPercent: state.globals.lcTenantRepPercent ?? 0.045,
            };
          }
        }
        if (state && version < 8 && !Array.isArray(state.deals)) {
          state.deals = [];
        }
        return state as unknown as PersistedState;
      },
    },
  ),
);

// ---------------------------------------------------------------------------
// Hydration helper
// ---------------------------------------------------------------------------

/**
 * Returns true once zustand's persist middleware has restored from localStorage.
 *
 * Use this in client components that render persisted state to avoid the
 * SSR/CSR mismatch flash where the server sends default values and the
 * client briefly shows them before the localStorage restore lands.
 */
export function useHasHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // Subscribe to hydration; also handle the case where it already finished.
    const unsub = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAppStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);
  return hydrated;
}

// ---------------------------------------------------------------------------
// Selector helpers
// ---------------------------------------------------------------------------

/** Convenience: look up a scenario record by id. */
export const selectScenario = (id: string) => (s: AppStore): ScenarioRecord | undefined =>
  s.scenarios.find((sc) => sc.id === id);
