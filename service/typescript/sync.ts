export interface StatusChange {
  changeId: string;
  serial: string;
  status: "ONLINE" | "OFFLINE";
  limitingFactors: string[];
  observedAt: string;
}

export type Outcome = "applied" | "duplicate" | "stale" | "unregistered";

export interface Deps {
  partnerUrl: string;
  get(url: string, timeoutMs?: number): Promise<{ status: number; body?: unknown }>;
  put(url: string, body: unknown, timeoutMs?: number): Promise<{ status: number; body?: unknown }>;
  attempts?: number;
  retryMs?: number;
}

const BLOCKING_FACTORS = new Set([
  "PILOT_REVIEW",
  "LOW_BATTERY",
  "HARDWARE_FAULT",
  "MAINTENANCE",
  "OUT_OF_ZONE",
]);

const CHANGE_HISTORY = 5000;

export function isAvailable(change: Pick<StatusChange, "status" | "limitingFactors">): boolean {
  return (
    change.status === "ONLINE" &&
    !change.limitingFactors.some((factor) => BLOCKING_FACTORS.has(factor))
  );
}

export function parseChange(serial: string, changeId: unknown, body: unknown): StatusChange | null {
  if (typeof body !== "object" || body === null) return null;

  const { status, limitingFactors, observedAt } = body as Record<string, unknown>;
  if (status !== "ONLINE" && status !== "OFFLINE") return null;
  if (typeof observedAt !== "string" || Number.isNaN(Date.parse(observedAt))) return null;

  const factors = limitingFactors === undefined ? [] : limitingFactors;
  if (!Array.isArray(factors) || factors.some((f) => typeof f !== "string")) return null;

  return {
    // an unnamed change is still worth applying, and serial plus observation time identifies it well enough to dedupe
    changeId: typeof changeId === "string" && changeId !== "" ? changeId : `${serial}@${observedAt}`,
    serial,
    status,
    limitingFactors: factors,
    observedAt,
  };
}

export function parsePublishedChange(payload: unknown): StatusChange | null {
  if (typeof payload !== "object" || payload === null) return null;

  const { serial, changeId } = payload as Record<string, unknown>;
  if (typeof serial !== "string" || serial === "") return null;

  return parseChange(serial, changeId, payload);
}

export function createSynchroniser(deps: Deps) {
  const attempts = deps.attempts ?? 3;
  const retryMs = deps.retryMs ?? 200;

  const inFlight = new Map<string, Promise<unknown>>();
  const appliedChanges = new Set<string>();
  const appliedAt = new Map<string, number>();

  async function resolveVehicleId(serial: string): Promise<string | null> {
    const res = await deps.get(`${deps.partnerUrl}/v1/vehicles?serial=${encodeURIComponent(serial)}`);
    if (res.status === 404) return null;

    const vehicleId = readVehicleId(res.body);
    if (res.status !== 200 || vehicleId === null) {
      throw new Error(`vehicle lookup for ${serial} returned ${res.status}`);
    }
    return vehicleId;
  }

  async function setAvailability(vehicleId: string, available: boolean): Promise<void> {
    const url = `${deps.partnerUrl}/v1/vehicles/${encodeURIComponent(vehicleId)}/availability`;
    let detail = "no attempt made";

    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (attempt > 1) await sleep(retryMs * (attempt - 1));
      try {
        const res = await deps.put(url, { available });
        if (res.status === 200 || res.status === 204) return;
        detail = `status ${res.status}`;
        if (res.status < 500) break;
      } catch (err) {
        detail = String(err);
      }
    }

    throw new Error(`availability write for ${vehicleId} failed: ${detail}`);
  }

  async function write(change: StatusChange): Promise<Outcome> {
    if (appliedChanges.has(change.changeId)) return "duplicate";

    const observedAt = Date.parse(change.observedAt);
    const newest = appliedAt.get(change.serial);
    if (newest !== undefined && observedAt < newest) return "stale";

    const vehicleId = await resolveVehicleId(change.serial);
    if (vehicleId === null) return "unregistered";

    await setAvailability(vehicleId, isAvailable(change));

    appliedAt.set(change.serial, observedAt);
    remember(change.changeId);
    return "applied";
  }

  function remember(changeId: string): void {
    appliedChanges.add(changeId);
    if (appliedChanges.size <= CHANGE_HISTORY) return;

    const oldest = appliedChanges.values().next().value;
    if (oldest !== undefined) appliedChanges.delete(oldest);
  }

  return {
    apply(change: StatusChange): Promise<Outcome> {
      // one robot at a time, so a slow write cannot be overtaken by the next change for the same robot
      const queued = inFlight.get(change.serial) ?? Promise.resolve();
      const next = queued.then(
        () => write(change),
        () => write(change),
      );
      inFlight.set(
        change.serial,
        next.catch(() => undefined),
      );
      return next;
    },
  };
}

function readVehicleId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;

  const { vehicleId } = body as Record<string, unknown>;
  return typeof vehicleId === "string" ? vehicleId : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
