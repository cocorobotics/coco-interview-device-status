import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { availabilityOnceWritten, publishChange, isolateTest, resumeTraffic } from "./stack.ts";

beforeEach(isolateTest);
afterEach(resumeTraffic);

test("given a robot online with nothing blocking it, when Fleet publishes that change, then HangryHippo shows it available", async () => {
  await publishChange("C10393", "ONLINE", []);

  assert.equal(await availabilityOnceWritten("veh_8f21c4"), true);
});
