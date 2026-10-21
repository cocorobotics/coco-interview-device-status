package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"testing"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

func isolateTest(t *testing.T) {
	t.Helper()
	if _, err := Post(config.FleetURL+"/v1/_debug/traffic", map[string]bool{"enabled": false}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { Post(config.FleetURL+"/v1/_debug/traffic", map[string]bool{"enabled": true}) })

	conn, ch := connect()
	defer conn.Close()
	if _, err := ch.QueuePurge(config.Queue, false); err != nil {
		t.Fatal(err)
	}
	// Lets a change your consumer already had in flight land before HangryHippo is cleared.
	time.Sleep(2 * time.Second)
	if _, err := Post(config.PartnerURL+"/v1/_debug/reset", nil); err != nil {
		t.Fatal(err)
	}
}

func publishChange(t *testing.T, serial, status string, limitingFactors []string) {
	t.Helper()
	body, _ := json.Marshal(StatusChange{
		Serial:          serial,
		Status:          status,
		LimitingFactors: limitingFactors,
		ObservedAt:      time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
	})
	id := make([]byte, 6)
	rand.Read(id)

	conn, ch := connect()
	defer conn.Close()
	err := ch.PublishWithContext(context.Background(), "fleet", "device.status.changed", false, false, amqp.Publishing{
		MessageId:   "chg_e2e_" + hex.EncodeToString(id),
		ContentType: "application/json",
		Body:        body,
	})
	if err != nil {
		t.Fatal(err)
	}
}

// recorded is false while HangryHippo has had nothing written for the vehicle.
func availability(t *testing.T, vehicleID string) (available, recorded bool) {
	t.Helper()
	res, err := Get(config.PartnerURL + "/v1/vehicles/" + vehicleID + "/availability")
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != 200 {
		return false, false
	}
	available, _ = res.Body["available"].(bool)
	return available, true
}
