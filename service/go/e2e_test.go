package main

import (
	"testing"
	"time"
)

func TestE2EGivenARobotOnlineWithNothingBlockingItWhenFleetPublishesThatChangeThenHangryHippoShowsItAvailable(t *testing.T) {
	isolateTest(t)

	publishChange(t, "C10393", "ONLINE", []string{})

	got := availabilityOnceWritten("veh_8f21c4", 20*time.Second)
	if got == nil || !*got {
		t.Fatalf("expected HangryHippo to show veh_8f21c4 available, got %v", got)
	}
}
