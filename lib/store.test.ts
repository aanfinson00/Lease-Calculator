// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";
import type { Comp } from "./comps";
import { useAppStore } from "./store";

// Reset store + localStorage before every test so cases don't bleed.
// deleteScenario refuses to leave the store empty, so we delete down to 1,
// rename the survivor, then add the second.
function resetStore() {
  localStorage.clear();
  const s = useAppStore.getState();
  // Delete every scenario except the last (deleteScenario blocks the final).
  while (useAppStore.getState().scenarios.length > 1) {
    useAppStore.getState().deleteScenario(useAppStore.getState().scenarios[0]!.id);
  }
  // Rename survivor to UW, add Proposal.
  const survivorId = useAppStore.getState().scenarios[0]!.id;
  useAppStore.getState().renameScenario(survivorId, "UW");
  const proposalId = useAppStore.getState().addScenario("Proposal");
  useAppStore.getState().setComparisonA(survivorId);
  useAppStore.getState().setComparisonB(proposalId);
  // Reset transient slice + property + globals + deals.
  useAppStore.setState({
    property: { name: "" },
    globals: {
      discountRate: 0.08,
      landCostPSF: 0,
      shellCostPSF: 140,
      softCostsPSF: 0,
      horizonMonths: 204,
    },
    deals: [],
    holdNer: null,
  });
  void s;
}

beforeEach(resetStore);

describe("useAppStore — scenarios CRUD", () => {
  it("starts with two scenarios after reset", () => {
    const s = useAppStore.getState();
    expect(s.scenarios).toHaveLength(2);
    expect(s.scenarios[0]!.inputs.name).toBe("UW");
    expect(s.scenarios[1]!.inputs.name).toBe("Proposal");
  });

  it("addScenario auto-suffixes duplicate names", () => {
    const { addScenario } = useAppStore.getState();
    addScenario("Counter");
    addScenario("Counter");
    addScenario("Counter");
    const names = useAppStore.getState().scenarios.map((s) => s.inputs.name);
    expect(names).toContain("Counter");
    expect(names).toContain("Counter 2");
    expect(names).toContain("Counter 3");
  });

  it("renameScenario updates the input name", () => {
    const s = useAppStore.getState();
    const id = s.scenarios[0]!.id;
    s.renameScenario(id, "Underwriting v2");
    expect(useAppStore.getState().scenarios[0]!.inputs.name).toBe("Underwriting v2");
  });

  it("duplicateScenario clones inputs with a (copy) suffix", () => {
    const s = useAppStore.getState();
    const sourceId = s.scenarios[1]!.id; // Proposal
    const copyId = s.duplicateScenario(sourceId);
    const copy = useAppStore.getState().scenarios.find((sc) => sc.id === copyId);
    expect(copy).toBeDefined();
    expect(copy!.inputs.name).toBe("Proposal (copy)");
    expect(copy!.id).not.toBe(sourceId);
  });

  it("deleteScenario repairs a broken comparison reference", () => {
    const s = useAppStore.getState();
    const aId = s.comparison.aId;
    s.deleteScenario(aId);
    const after = useAppStore.getState();
    expect(after.scenarios.find((sc) => sc.id === aId)).toBeUndefined();
    expect(after.comparison.aId).not.toBe(aId);
    // Ensure comparison still points to a real scenario
    expect(after.scenarios.find((sc) => sc.id === after.comparison.aId)).toBeDefined();
  });

  it("deleteScenario refuses to leave the store empty", () => {
    const s = useAppStore.getState();
    s.deleteScenario(s.scenarios[0]!.id);
    s.deleteScenario(useAppStore.getState().scenarios[0]!.id);
    // Now we'd be at 1 — try to delete the last
    const last = useAppStore.getState();
    last.deleteScenario(last.scenarios[0]!.id);
    expect(useAppStore.getState().scenarios.length).toBeGreaterThanOrEqual(1);
  });
});

describe("useAppStore — input updates", () => {
  it("updateInput mutates only the targeted scenario", () => {
    const s = useAppStore.getState();
    const [first, second] = s.scenarios;
    s.updateInput(first!.id, "baseRatePSF", 12.5);
    const after = useAppStore.getState();
    expect(after.scenarios.find((sc) => sc.id === first!.id)!.inputs.baseRatePSF).toBe(12.5);
    expect(after.scenarios.find((sc) => sc.id === second!.id)!.inputs.baseRatePSF).not.toBe(12.5);
  });

  it("updateGlobals patches without clobbering siblings", () => {
    const s = useAppStore.getState();
    s.updateGlobals({ discountRate: 0.1 });
    const g = useAppStore.getState().globals;
    expect(g.discountRate).toBe(0.1);
    expect(g.shellCostPSF).toBe(140); // unchanged
  });

  it("setPropertyName works", () => {
    useAppStore.getState().setPropertyName("123 Logistics Way");
    expect(useAppStore.getState().property.name).toBe("123 Logistics Way");
  });
});

describe("useAppStore — Hold-NER (transient)", () => {
  it("setHoldNer enables solver mode", () => {
    const s = useAppStore.getState();
    s.setHoldNer({
      enabled: true,
      targetNER: 7.5,
      freeVar: "baseRatePSF",
      scenarioId: s.scenarios[0]!.id,
      nerKind: "discounted",
    });
    expect(useAppStore.getState().holdNer?.enabled).toBe(true);
  });

  it("setHoldNer(null) clears it", () => {
    const s = useAppStore.getState();
    s.setHoldNer({
      enabled: true,
      targetNER: 7.5,
      freeVar: "baseRatePSF",
      scenarioId: s.scenarios[0]!.id,
      nerKind: "discounted",
    });
    s.setHoldNer(null);
    expect(useAppStore.getState().holdNer).toBeNull();
  });
});

describe("useAppStore — persistence", () => {
  it("persists to localStorage under the expected key", () => {
    const s = useAppStore.getState();
    s.setPropertyName("Persistence Probe");
    const raw = localStorage.getItem("lease-calculator/v1");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.property.name).toBe("Persistence Probe");
  });

  it("does NOT persist holdNer (transient slice)", () => {
    const s = useAppStore.getState();
    s.setHoldNer({
      enabled: true,
      targetNER: 7.5,
      freeVar: "baseRatePSF",
      scenarioId: s.scenarios[0]!.id,
      nerKind: "discounted",
    });
    const raw = localStorage.getItem("lease-calculator/v1");
    const parsed = JSON.parse(raw!);
    expect(parsed.state.holdNer).toBeUndefined();
  });
});

describe("useAppStore — deals slice (uploaded CSV)", () => {
  const fakeDeal: Comp = {
    id: "test-comp-1",
    code: "TestCode",
    dealName: "Test Deal",
    tenantName: "Test Tenant",
    status: "EXECUTED",
    commencementDate: "2026-01-01",
    projectSF: 100_000,
    buildingSF: 90_000,
    leaseSF: 80_000,
    baseRatePSF: 10,
    escalation: 0.03,
    leaseTermMonths: 60,
    freeRentMonths: 3,
    tiAllowancePSF: 5,
    tiDurationMonths: 1,
    lcLLRepPercent: 0.02,
    lcTenantRepPercent: 0.04,
    leaseStructure: "NNN",
    createdAt: "2026-01-01T00:00:00.000Z",
    modifiedAt: "2026-01-01T00:00:00.000Z",
  };

  it("starts empty", () => {
    expect(useAppStore.getState().deals).toEqual([]);
  });

  it("setDeals replaces the list; clearDeals empties it", () => {
    useAppStore.getState().setDeals([fakeDeal, { ...fakeDeal, code: "Other" }]);
    expect(useAppStore.getState().deals).toHaveLength(2);
    useAppStore.getState().clearDeals();
    expect(useAppStore.getState().deals).toEqual([]);
  });

  it("round-trips through localStorage (persisted)", () => {
    useAppStore.getState().setDeals([fakeDeal]);
    const raw = localStorage.getItem("lease-calculator/v1");
    const parsed = JSON.parse(raw!);
    expect(parsed.state.deals).toHaveLength(1);
    expect(parsed.state.deals[0].code).toBe("TestCode");
  });
});
