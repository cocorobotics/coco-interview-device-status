import amqp, { type Channel, type ConsumeMessage } from "amqplib";

export const config = {
  amqpUrl: process.env.AMQP_URL ?? "amqp://guest:guest@localhost:5672/",
  queue: process.env.QUEUE ?? "device-status",
  fleetUrl: process.env.FLEET_URL ?? "http://localhost:4001",
  partnerUrl: process.env.PARTNER_URL ?? "http://localhost:4002",
};

export interface StatusChange {
  serial: string;
  status: "ONLINE" | "OFFLINE";
  limitingFactors: string[];
  observedAt: string;
}

export async function handleStatusChange(msg: ConsumeMessage): Promise<void> {
  const change: StatusChange = JSON.parse(msg.content.toString());

  console.log(
    `change=${msg.properties.messageId} serial=${change.serial} status=${change.status} ` +
      `factors=${change.limitingFactors} redelivered=${msg.fields.redelivered}`,
  );

  // TODO: the steps in the README go here.
}

async function main(): Promise<void> {
  const channel = await connect();
  await channel.prefetch(1);

  console.log(`consuming ${config.queue}`);

  await channel.consume(config.queue, async (msg) => {
    if (msg === null) return;
    try {
      await handleStatusChange(msg);
      channel.ack(msg);
    } catch (err) {
      console.error(`message ${msg.properties.messageId} failed:`, err);
      channel.nack(msg, false, false);
    }
  });
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

// --- plumbing, nothing below here is part of the exercise ---

async function connect(): Promise<Channel> {
  for (let attempt = 1; ; attempt++) {
    try {
      const conn = await amqp.connect(config.amqpUrl);
      return await conn.createChannel();
    } catch (err) {
      if (attempt >= 30) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

const DEFAULT_TIMEOUT_MS = 3000;

export interface HttpResponse<T = unknown> {
  status: number;
  body: T | undefined;
}

export async function get<T = unknown>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<HttpResponse<T>> {
  return await call<T>("GET", url, undefined, timeoutMs);
}

export async function put<T = unknown>(url: string, body: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<HttpResponse<T>> {
  return await call<T>("PUT", url, body, timeoutMs);
}

export async function post<T = unknown>(url: string, body: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<HttpResponse<T>> {
  return await call<T>("POST", url, body, timeoutMs);
}

async function call<T>(method: string, url: string, body: unknown, timeoutMs: number): Promise<HttpResponse<T>> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as T) : undefined };
}
