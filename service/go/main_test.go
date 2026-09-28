package main

import (
	"testing"

	amqp "github.com/rabbitmq/amqp091-go"
)

func TestGivenAWellFormedStatusChangeWhenItIsHandledThenItIsAccepted(t *testing.T) {
	d := amqp.Delivery{
		MessageId: "chg_test",
		Body:      []byte(`{"serial":"C10393","status":"ONLINE","limitingFactors":[],"observedAt":"2026-09-24T17:02:11.482Z"}`),
	}

	err := handleStatusChange(d)

	if err != nil {
		t.Fatalf("expected the change to be accepted, got %v", err)
	}
}
