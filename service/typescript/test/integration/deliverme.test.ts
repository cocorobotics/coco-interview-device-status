import { test } from "node:test";
import assert from "node:assert/strict";

import { config, get } from "../../server.ts";

test("given a robot registered with DeliverMe, when its serial is looked up, then DeliverMe returns its vehicle id", async () => {
  const res = await get(`${config.partnerUrl}/v1/vehicles?serial=C10393`);

  assert.deepEqual(res, { status: 200, body: { serial: "C10393", vehicleId: "veh_8f21c4" } });
});
