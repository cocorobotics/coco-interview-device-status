package main

import "testing"

func TestE2EGivenARobotOnlineWithNothingBlockingItWhenFleetPublishesThatChangeThenTheTestCanReadHangryHipposAvailabilityForIt(t *testing.T) {
	isolateTest(t)

	publishChange(t, "C10393", "ONLINE", []string{})

	available, recorded := availability(t, "veh_8f21c4")
	t.Logf("veh_8f21c4 recorded=%v available=%v", recorded, available)
}
