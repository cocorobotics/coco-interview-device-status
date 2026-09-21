export interface DeviceState {
  status: string;
  limitingFactors: string[];
}

// The published table is the contract. auditAvailabilityRule reports when the fleet's endpoint drifts from it.
const BLOCKING_FACTORS = new Set([
  "PILOT_REVIEW",
  "LOW_BATTERY",
  "HARDWARE_FAULT",
  "MAINTENANCE",
  "OUT_OF_ZONE",
]);

export function isAvailable(state: DeviceState): boolean {
  return (
    state.status === "ONLINE" &&
    !state.limitingFactors.some((factor) => BLOCKING_FACTORS.has(factor.toUpperCase()))
  );
}

const DOCUMENTED_RULE: DeviceState[] = [
  { status: "ONLINE", limitingFactors: [] },
  { status: "OFFLINE", limitingFactors: [] },
  { status: "ONLINE", limitingFactors: ["PILOT_REVIEW"] },
  { status: "ONLINE", limitingFactors: ["LOW_BATTERY"] },
  { status: "ONLINE", limitingFactors: ["HARDWARE_FAULT"] },
  { status: "ONLINE", limitingFactors: ["MAINTENANCE"] },
  { status: "ONLINE", limitingFactors: ["OUT_OF_ZONE"] },
  { status: "ONLINE", limitingFactors: ["HEAVY_RAIN"] },
];

export interface Disagreement {
  state: DeviceState;
  ours: boolean;
  theirs: boolean;
}

type Post = (url: string, body: unknown) => Promise<{ status: number; body?: unknown }>;

// Our copy of someone else's rule goes stale in silence, so each boot asks them what they would have said.
export async function auditAvailabilityRule(
  post: Post,
  fleetUrl: string,
): Promise<Disagreement[]> {
  const disagreements: Disagreement[] = [];

  for (const state of DOCUMENTED_RULE) {
    const res = await post(`${fleetUrl}/v1/availability`, state);
    const theirs = readAvailable(res.body);
    if (res.status !== 200 || theirs === null) {
      throw new Error(`availability probe returned ${res.status}`);
    }

    const ours = isAvailable(state);
    if (ours !== theirs) disagreements.push({ state, ours, theirs });
  }

  return disagreements;
}

function readAvailable(body: unknown): boolean | null {
  if (typeof body !== "object" || body === null) return null;

  const { available } = body as Record<string, unknown>;
  return typeof available === "boolean" ? available : null;
}
