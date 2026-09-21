import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSynchroniser,
  isAvailable,
  parseChange,
  type Deps,
  type StatusChange,
} from "./sync.ts";

interface RuleCase {
  name: string;
  status: StatusChange["status"];
  limitingFactors: string[];
  available: boolean;
}

const ruleCases: RuleCase[] = [
  { name: "online and unencumbered", status: "ONLINE", limitingFactors: [], available: true },
  { name: "online and held for pilot review", status: "ONLINE", limitingFactors: ["PILOT_REVIEW"], available: false },
  { name: "online and below the dispatch threshold", status: "ONLINE", limitingFactors: ["LOW_BATTERY"], available: false },
  { name: "online with a critical fault", status: "ONLINE", limitingFactors: ["HARDWARE_FAULT"], available: false },
  { name: "online but pulled from service", status: "ONLINE", limitingFactors: ["MAINTENANCE"], available: false },
  { name: "online outside its hub area", status: "ONLINE", limitingFactors: ["OUT_OF_ZONE"], available: false },
  { name: "online with an informational factor only", status: "ONLINE", limitingFactors: ["HEAVY_RAIN"], available: true },
  { name: "online with an informational and a blocking factor", status: "ONLINE", limitingFactors: ["HEAVY_RAIN", "LOW_BATTERY"], available: false },
  { name: "offline and unencumbered", status: "OFFLINE", limitingFactors: [], available: false },
  { name: "offline with an informational factor only", status: "OFFLINE", limitingFactors: ["HEAVY_RAIN"], available: false },
];

for (const scenario of ruleCases) {
  test(`given a robot ${scenario.name}, when availability is decided, then it is ${scenario.available}`, () => {
    assert.equal(
      isAvailable({ status: scenario.status, limitingFactors: scenario.limitingFactors }),
      scenario.available,
    );
  });
}

test("given a fleet call with no change id, when the change is parsed, then it is named after the robot and the observation", () => {
  const change = parseChange("C10393", undefined, {
    status: "ONLINE",
    limitingFactors: [],
    observedAt: "2026-09-18T17:02:11Z",
  });

  assert.equal(change?.changeId, "C10393@2026-09-18T17:02:11Z");
});

test("given a fleet call with no limiting factors at all, when the change is parsed, then the robot is unencumbered", () => {
  const change = parseChange("C10393", "chg_1", {
    status: "ONLINE",
    observedAt: "2026-09-18T17:02:11Z",
  });

  assert.deepEqual(change?.limitingFactors, []);
});

interface RejectedCase {
  name: string;
  body: unknown;
}

const rejectedCases: RejectedCase[] = [
  { name: "a status we do not know", body: { status: "SLEEPING", observedAt: "2026-09-18T17:02:11Z" } },
  { name: "no status", body: { observedAt: "2026-09-18T17:02:11Z" } },
  { name: "an unreadable observation time", body: { status: "ONLINE", observedAt: "yesterday" } },
  { name: "limiting factors that are not a list", body: { status: "ONLINE", limitingFactors: "LOW_BATTERY", observedAt: "2026-09-18T17:02:11Z" } },
  { name: "no body at all", body: undefined },
];

for (const scenario of rejectedCases) {
  test(`given a fleet call with ${scenario.name}, when the change is parsed, then it is rejected`, () => {
    assert.equal(parseChange("C10393", "chg_1", scenario.body), null);
  });
}

test("given an online robot with nothing blocking it, when its change is applied, then the partner is told it can take work", async () => {
  const partner = partnerDouble();
  const sync = createSynchroniser(partner.deps);

  const outcome = await sync.apply(change({ changeId: "chg_1" }));

  assert.equal(outcome, "applied");
  assert.deepEqual(partner.writes, [{ vehicleId: "veh_8f21c4", available: true }]);
});

test("given a change the bus has already delivered, when it is delivered again, then the partner is written once", async () => {
  const partner = partnerDouble();
  const sync = createSynchroniser(partner.deps);

  const first = await sync.apply(change({ changeId: "chg_1" }));
  const second = await sync.apply(change({ changeId: "chg_1" }));

  assert.deepEqual([first, second], ["applied", "duplicate"]);
  assert.equal(partner.writes.length, 1);
});

test("given a newer change already applied, when an older change is delivered late, then the partner keeps the newer value", async () => {
  const partner = partnerDouble();
  const sync = createSynchroniser(partner.deps);

  const newer = await sync.apply(
    change({ changeId: "chg_2", observedAt: "2026-09-18T17:02:20Z", limitingFactors: ["LOW_BATTERY"] }),
  );
  const older = await sync.apply(change({ changeId: "chg_1", observedAt: "2026-09-18T17:02:11Z" }));

  assert.deepEqual([newer, older], ["applied", "stale"]);
  assert.deepEqual(partner.writes, [{ vehicleId: "veh_8f21c4", available: false }]);
});

test("given two changes for one robot delivered at the same moment, when both are applied, then the writes do not overlap", async () => {
  const partner = partnerDouble({ putDelayMs: 20 });
  const sync = createSynchroniser(partner.deps);

  await Promise.all([
    sync.apply(change({ changeId: "chg_1", observedAt: "2026-09-18T17:02:11Z" })),
    sync.apply(
      change({ changeId: "chg_2", observedAt: "2026-09-18T17:02:20Z", limitingFactors: ["MAINTENANCE"] }),
    ),
  ]);

  assert.equal(partner.peakConcurrentWrites(), 1);
  assert.deepEqual(partner.writes.at(-1), { vehicleId: "veh_8f21c4", available: false });
});

test("given a robot the partner has never registered, when its change is applied, then nothing is written", async () => {
  const partner = partnerDouble({ vehicles: {} });
  const sync = createSynchroniser(partner.deps);

  const outcome = await sync.apply(change({ changeId: "chg_1" }));

  assert.equal(outcome, "unregistered");
  assert.deepEqual(partner.writes, []);
});

test("given the partner sheds load once, when the change is applied, then the write is retried and lands", async () => {
  const partner = partnerDouble({ putStatuses: [503] });
  const sync = createSynchroniser({ ...partner.deps, retryMs: 1 });

  const outcome = await sync.apply(change({ changeId: "chg_1" }));

  assert.equal(outcome, "applied");
  assert.deepEqual(partner.writes, [{ vehicleId: "veh_8f21c4", available: true }]);
});

test("given the partner sheds load on every attempt, when the change is applied, then it fails and a redelivery writes it", async () => {
  const partner = partnerDouble({ putStatuses: [503, 503, 503] });
  const sync = createSynchroniser({ ...partner.deps, retryMs: 1 });

  await assert.rejects(sync.apply(change({ changeId: "chg_1" })), /failed: status 503/);
  const redelivered = await sync.apply(change({ changeId: "chg_1" }));

  assert.equal(redelivered, "applied");
  assert.deepEqual(partner.writes, [{ vehicleId: "veh_8f21c4", available: true }]);
});

function change(overrides: Partial<StatusChange>): StatusChange {
  return {
    changeId: "chg_1",
    serial: "C10393",
    status: "ONLINE",
    limitingFactors: [],
    observedAt: "2026-09-18T17:02:11Z",
    ...overrides,
  };
}

interface PartnerDoubleOptions {
  vehicles?: Record<string, string>;
  putStatuses?: number[];
  putDelayMs?: number;
}

const AVAILABILITY_PATH = /\/v1\/vehicles\/([^/]+)\/availability$/;

function partnerDouble(options: PartnerDoubleOptions = {}) {
  const vehicles = options.vehicles ?? { C10393: "veh_8f21c4" };
  const statuses = [...(options.putStatuses ?? [])];
  const writes: Array<{ vehicleId: string; available: boolean }> = [];
  let concurrentWrites = 0;
  let peak = 0;

  const deps: Deps = {
    partnerUrl: "http://partner",

    async get(url) {
      const serial = new URL(url).searchParams.get("serial") ?? "";
      const vehicleId = vehicles[serial];
      if (vehicleId === undefined) return { status: 404 };
      return { status: 200, body: { serial, vehicleId } };
    },

    async put(url, body) {
      concurrentWrites += 1;
      peak = Math.max(peak, concurrentWrites);
      try {
        if (options.putDelayMs !== undefined) {
          await new Promise((resolve) => setTimeout(resolve, options.putDelayMs));
        }

        const status = statuses.shift() ?? 204;
        if (status === 204) {
          writes.push({
            vehicleId: AVAILABILITY_PATH.exec(url)?.[1] ?? "",
            available: (body as { available: boolean }).available,
          });
        }
        return { status };
      } finally {
        concurrentWrites -= 1;
      }
    },
  };

  return { deps, writes, peakConcurrentWrites: () => peak };
}
