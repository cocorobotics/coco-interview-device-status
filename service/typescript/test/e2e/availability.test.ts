import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import amqp from "amqplib";

import { config, get, post, type StatusChange } from "../../server.ts";

beforeEach(async () => {
  await post(`${config.fleetUrl}/v1/_debug/traffic`, { enabled: false });
  const conn = await amqp.connect(config.amqpUrl);
  await (await conn.createChannel()).purgeQueue(config.queue);
  await conn.close();
  // Lets a change your consumer already had in flight land before DeliverMe is cleared.
  await sleep(2000);
  await post(`${config.partnerUrl}/v1/_debug/reset`, undefined);
});

afterEach(async () => {
  await post(`${config.fleetUrl}/v1/_debug/traffic`, { enabled: true });
});

async function publishChange(serial: string, status: StatusChange["status"], limitingFactors: string[]): Promise<void> {
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

async function availabilityOnceWritten(vehicleId: string, timeoutMs = 20_000): Promise<boolean | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await get<{ available: boolean }>(`${config.partnerUrl}/v1/vehicles/${vehicleId}/availability`);
    if (res.status === 200) return res.body?.available;
    await sleep(250);
  }
  return undefined;
}

test("given a robot online with nothing blocking it, when the fleet publishes that change, then DeliverMe shows it available", async () => {
  await publishChange("C10393", "ONLINE", []);

  assert.equal(await availabilityOnceWritten("veh_8f21c4"), true);
});
