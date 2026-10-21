import { afterEach, beforeEach, test } from "node:test";

import { isolateTest, publishChange, resumeTraffic } from "./stack.ts";

beforeEach(isolateTest);
afterEach(resumeTraffic);

test("given a robot online with nothing blocking it, when Fleet publishes that change, then the publish succeeds", async () => {
  await publishChange("C10393", "ONLINE", []);
});
