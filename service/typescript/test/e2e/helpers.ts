import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import amqp from "amqplib";

import { config, get, post, type StatusChange } from "../../server.ts";

export async function isolateTest(): Promise<void> {
  await post(`${config.fleetUrl}/v1/_debug/traffic`, { enabled: false });
  const conn = await amqp.connect(config.amqpUrl);
  await (await conn.createChannel()).purgeQueue(config.queue);
  await conn.close();
  // Lets a change your consumer already had in flight land before HangryHippo is cleared.
  await sleep(2000);
  await post(`${config.partnerUrl}/v1/_debug/reset`, undefined);
}

export async function resumeTraffic(): Promise<void> {
  await post(`${config.fleetUrl}/v1/_debug/traffic`, { enabled: true });
}

export async function publishChange(serial: string, status: StatusChange["status"], limitingFactors: string[]): Promise<void> {
  const change: StatusChange = { serial, status, limitingFactors, observedAt: new Date().toISOString() };
  const conn = await amqp.connect(config.amqpUrl);
  const channel = await conn.createConfirmChannel();
  channel.publish("fleet", "device.status.changed", Buffer.from(JSON.stringify(change)), {
    messageId: `chg_e2e_${randomBytes(6).toString("hex")}`,
    contentType: "application/json",
  });
  await channel.waitForConfirms();
  await conn.close();
}

export async function getVehicleId(serial: string): Promise<string> {
  const res = await get<{ vehicleId: string }>(`${config.fleetUrl}/v1/devices/${serial}/partner-accounts/hangry-hippo`);
  if (res.status !== 200 || !res.body) throw new Error(`Fleet has no HangryHippo vehicle for ${serial}: status ${res.status}`);
  return res.body.vehicleId;
}

// Undefined while HangryHippo has had nothing written for the vehicle.
export async function getAvailability(vehicleId: string): Promise<boolean | undefined> {
  const res = await get<{ available: boolean }>(`${config.partnerUrl}/v1/vehicles/${vehicleId}/availability`);
  return res.status === 200 ? res.body?.available : undefined;
}
