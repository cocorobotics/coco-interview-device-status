import { afterEach, beforeEach, test } from "node:test";

import { getAvailability, isolateTest, publishChange, resumeTraffic } from "./stack.ts";

beforeEach(isolateTest);
afterEach(resumeTraffic);

test("given a robot online with nothing blocking it, when Fleet publishes that change, then the test can read HangryHippo's availability for it", async () => {
  await publishChange("C10393", "ONLINE", []);

  console.log("veh_8f21c4 available:", await getAvailability("veh_8f21c4"));
});
