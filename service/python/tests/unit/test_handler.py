import json
from types import SimpleNamespace

from server import handle_status_change


class FakeChannel:
    def __init__(self):
        self.acked = []

    def basic_ack(self, delivery_tag):
        self.acked.append(delivery_tag)


def delivery(body, message_id="chg_test", delivery_tag=1):
    method = SimpleNamespace(delivery_tag=delivery_tag, redelivered=False)
    properties = SimpleNamespace(message_id=message_id)
    return method, properties, json.dumps(body).encode()


def test_given_a_well_formed_status_change_when_it_is_handled_then_the_message_is_acked():
    channel = FakeChannel()
    method, properties, body = delivery(
        {"serial": "C10393", "status": "ONLINE", "limitingFactors": [], "observedAt": "2026-09-24T17:02:11.482Z"},
        delivery_tag=7,
    )

    handle_status_change(channel, method, properties, body)

    assert channel.acked == [7]
