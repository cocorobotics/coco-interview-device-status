import time

import pika
import pytest

from server import CONFIG, get, post


@pytest.fixture
def quiet_stack():
    post(f"{CONFIG['fleet_url']}/v1/_debug/traffic", {"enabled": False})
    with pika.BlockingConnection(pika.URLParameters(CONFIG["amqp_url"])) as conn:
        conn.channel().queue_purge(CONFIG["queue"])
    # Lets a change your consumer already had in flight land before HangryHippo is cleared.
    time.sleep(2)
    post(f"{CONFIG['partner_url']}/v1/_debug/reset")
    yield
    post(f"{CONFIG['fleet_url']}/v1/_debug/traffic", {"enabled": True})


def publish_change(serial, status, limiting_factors):
    res = post(f"{CONFIG['fleet_url']}/v1/_debug/changes", {
        "serial": serial,
        "status": status,
        "limitingFactors": limiting_factors,
    })
    assert res["status"] == 200, f"fleet did not publish the change: {res}"


def hangry_hippo_calls(vehicle_id):
    res = get(f"{CONFIG['partner_url']}/v1/_debug/calls")
    return [call for call in res["body"]["calls"] if call["vehicleId"] == vehicle_id]


def availability_once_written(vehicle_id, timeout_s=20):
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        res = get(f"{CONFIG['partner_url']}/v1/vehicles/{vehicle_id}/availability")
        if res["status"] == 200:
            return res["body"]["available"]
        time.sleep(0.25)
    return None


def test_given_a_robot_online_with_nothing_blocking_it_when_the_fleet_publishes_that_change_then_hangry_hippo_shows_it_available(quiet_stack):
    publish_change("C10393", "ONLINE", [])

    assert availability_once_written("veh_8f21c4") is True
