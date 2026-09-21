import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { auditAvailabilityRule } from "./availability.ts";
import {
  createSynchroniser,
  parseChange,
  parsePublishedChange,
  type StatusChange,
} from "./sync.ts";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  fleetUrl: process.env.FLEET_URL ?? "http://localhost:4001",
  partnerUrl: process.env.PARTNER_URL ?? "http://localhost:4002",
  busUrl: process.env.BUS_URL ?? "http://localhost:4003",
};

const TOPIC = "device.status";

// the fleet gives us 500ms for the whole call, so a slow bus has to fail while there is still time to answer
const PUBLISH_TIMEOUT_MS = 250;

const STATUS_CHANGE = /^\/v1\/devices\/([^/]+)\/status$/;

const synchroniser = createSynchroniser({ partnerUrl: config.partnerUrl, get, put });

async function handleStatusChange(
  req: IncomingMessage,
  res: ServerResponse,
  serial: string,
): Promise<void> {
  const change = parseChange(serial, req.headers["x-change-id"], await readJson(req));
  if (change === null) {
    console.warn(`rejected serial=${serial} reason=unparseable`);
    return sendJson(res, 400, { error: "unparseable status change" });
  }

  if (!(await publish(change))) {
    // a 5xx buys two more tries from the fleet, acking something we have not queued loses it outright
    return sendJson(res, 503, { error: "could not queue the change" });
  }

  console.log(
    `queued change=${change.changeId} serial=${serial} status=${change.status} factors=${change.limitingFactors}`,
  );
  sendJson(res, 202, { status: "queued" });
}

interface Envelope {
  messageId?: string;
  attempt?: number;
  payload?: unknown;
}

async function handleDelivery(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const envelope = await readJson<Envelope>(req);
  const change = parsePublishedChange(envelope?.payload);
  if (change === null) {
    // retrying a message we cannot read only burns its attempts, so take it off the queue
    console.warn(`dropped message=${envelope?.messageId} reason=unparseable`);
    return sendJson(res, 200, { status: "dropped" });
  }

  try {
    const outcome = await synchroniser.apply(change);
    console.log(
      `${outcome} change=${change.changeId} serial=${change.serial} attempt=${envelope?.attempt}`,
    );
    sendJson(res, 200, { status: outcome });
  } catch (err) {
    console.error(`failed change=${change.changeId} serial=${change.serial}: ${err}`);
    sendJson(res, 502, { error: String(err) });
  }
}

async function publish(change: StatusChange): Promise<boolean> {
  try {
    const res = await post(
      `${config.busUrl}/v1/topics/${TOPIC}/messages`,
      change,
      PUBLISH_TIMEOUT_MS,
    );
    if (res.status >= 200 && res.status < 300) return true;

    console.error(`publish change=${change.changeId} returned ${res.status}`);
    return false;
  } catch (err) {
    console.error(`publish change=${change.changeId} failed: ${err}`);
    return false;
  }
}

async function auditFleetRule(): Promise<void> {
  try {
    const disagreements = await auditAvailabilityRule(post, config.fleetUrl);
    if (disagreements.length === 0) {
      console.log("fleet /v1/availability agrees with the documented rule");
      return;
    }

    for (const { state, ours, theirs } of disagreements) {
      console.warn(
        `fleet /v1/availability disagrees: status=${state.status} factors=${state.limitingFactors} documented=${ours} fleet=${theirs}`,
      );
    }
  } catch (err) {
    console.warn(`could not audit the fleet's availability rule: ${err}`);
  }
}

export const server = createServer(async (req, res) => {
  try {
    const path = (req.url ?? "").split("?")[0];

    const match = req.method === "POST" ? path.match(STATUS_CHANGE) : null;
    if (match) return await handleStatusChange(req, res, match[1]);

    if (req.method === "POST" && path === "/internal/events") {
      return await handleDelivery(req, res);
    }

    if (req.method === "GET" && path === "/health") {
      return sendJson(res, 200, { status: "ok" });
    }

    sendJson(res, 404, { error: "not found", method: req.method, path });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: String(err) });
  }
});

// Guarded so a test that imports this file does not bind the port.
if (import.meta.main) {
  server.listen(config.port, () => {
    console.log(`listening on :${config.port}`);
    void auditFleetRule();
  });
}

// --- plumbing, nothing below here is part of the exercise ---

export interface HttpResponse<T = unknown> {
  status: number;
  body: T | undefined;
}

export async function get<T = unknown>(url: string, timeoutMs = 3000): Promise<HttpResponse<T>> {
  return await call<T>("GET", url, undefined, timeoutMs);
}

export async function put<T = unknown>(
  url: string,
  body: unknown,
  timeoutMs = 3000,
): Promise<HttpResponse<T>> {
  return await call<T>("PUT", url, body, timeoutMs);
}

export async function post<T = unknown>(
  url: string,
  body: unknown,
  timeoutMs = 3000,
): Promise<HttpResponse<T>> {
  return await call<T>("POST", url, body, timeoutMs);
}

async function call<T>(
  method: string,
  url: string,
  body: unknown,
  timeoutMs: number,
): Promise<HttpResponse<T>> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as T) : undefined };
}

export async function readJson<T>(req: IncomingMessage): Promise<T | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString()) as T;
}

export function sendJson(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
