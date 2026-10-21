package main

import "testing"

func TestE2EGivenARobotOnlineWithNothingBlockingItWhenFleetPublishesThatChangeThenThePublishSucceeds(t *testing.T) {
	isolateTest(t)

	publishChange(t, "C10393", "ONLINE", []string{})
}
