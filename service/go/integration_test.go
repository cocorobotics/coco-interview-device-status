package main

import "testing"

func TestIntegrationGivenARobotRegisteredWithDeliverMeWhenItsSerialIsLookedUpThenDeliverMeReturnsItsVehicleId(t *testing.T) {
	res, err := Get(config.PartnerURL + "/v1/vehicles?serial=C10393")
	if err != nil {
		t.Fatal(err)
	}

	if res.Status != 200 || res.Body["vehicleId"] != "veh_8f21c4" {
		t.Fatalf("expected 200 with vehicleId veh_8f21c4, got %d %v", res.Status, res.Body)
	}
}
