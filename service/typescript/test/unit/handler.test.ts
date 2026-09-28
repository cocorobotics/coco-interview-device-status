import { test } from "node:test";
import assert from "node:assert/strict";
import type { ConsumeMessage } from "amqplib";

import { handleStatusChange } from "../../server.ts";

function delivery(body: unknown, messageId = "chg_test"): ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(body)),
    fields: { deliveryTag: 1, redelivered: false, exchange: "fleet", routingKey: "device.status.changed", consumerTag: "test" },
    properties: { messageId } as ConsumeMessage["properties"],
  };
}

test("given a well-formed status change, when it is handled, then it is accepted", async () => {
  const msg = delivery({ serial: "C10393", status: "ONLINE", limitingFactors: [], observedAt: "2026-09-24T17:02:11.482Z" });

  await assert.doesNotReject(handleStatusChange(msg));
});
