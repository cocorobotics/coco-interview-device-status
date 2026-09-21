import assert from "node:assert/strict";
import { test } from "node:test";
import { auditAvailabilityRule, isAvailable, type DeviceState } from "./availability.ts";

interface RuleCase {
  name: string;
  status: string;
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
  { name: "online with a blocking factor in lower case", status: "ONLINE", limitingFactors: ["low_battery"], available: false },
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

const DOCUMENTED_ANSWERS: Record<string, boolean> = {
  "ONLINE|": true,
  "OFFLINE|": false,
  "ONLINE|PILOT_REVIEW": false,
  "ONLINE|LOW_BATTERY": false,
  "ONLINE|HARDWARE_FAULT": false,
  "ONLINE|MAINTENANCE": false,
  "ONLINE|OUT_OF_ZONE": false,
  "ONLINE|HEAVY_RAIN": true,
};

test("given a fleet that answers by its own documentation, when the rule is audited, then nothing is reported", async () => {
  const fleet = fleetDouble(DOCUMENTED_ANSWERS);

  const disagreements = await auditAvailabilityRule(fleet.post, "http://fleet");

  assert.deepEqual(disagreements, []);
});

test("given a fleet that calls a robot in maintenance available, when the rule is audited, then the disagreement is reported", async () => {
  const fleet = fleetDouble({ ...DOCUMENTED_ANSWERS, "ONLINE|MAINTENANCE": true });

  const disagreements = await auditAvailabilityRule(fleet.post, "http://fleet");

  assert.deepEqual(disagreements, [
    { state: { status: "ONLINE", limitingFactors: ["MAINTENANCE"] }, ours: false, theirs: true },
  ]);
});

test("given a fleet that cannot answer, when the rule is audited, then the audit fails rather than reporting agreement", async () => {
  const fleet = { post: async () => ({ status: 503 }) };

  await assert.rejects(
    auditAvailabilityRule(fleet.post, "http://fleet"),
    /availability probe returned 503/,
  );
});

function fleetDouble(answers: Record<string, boolean>) {
  const asked: string[] = [];

  async function post(_url: string, body: unknown) {
    const state = body as DeviceState;
    const key = `${state.status}|${state.limitingFactors.join(",")}`;
    asked.push(key);

    const available = answers[key];
    if (available === undefined) throw new Error(`the audit probed an unexpected state: ${key}`);
    return { status: 200, body: { available, blockingFactors: [] } };
  }

  return { post, asked };
}
