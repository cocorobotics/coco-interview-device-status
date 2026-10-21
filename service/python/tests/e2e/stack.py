import json
import time
import uuid
from datetime import datetime, timezone

import pika

from server import CONFIG, get, post


def isolate_test():
    post(f"{CONFIG['fleet_url']}/v1/_debug/traffic", {"enabled": False})
    with pika.BlockingConnection(pika.URLParameters(CONFIG["amqp_url"])) as conn:
        conn.channel().queue_purge(CONFIG["queue"])
    # Lets a change your consumer already had in flight land before HangryHippo is cleared.
    time.sleep(2)
    post(f"{CONFIG['partner_url']}/v1/_debug/reset")


def resume_traffic():
    post(f"{CONFIG['fleet_url']}/v1/_debug/traffic", {"enabled": True})


def publish_change(serial, status, limiting_factors):
    with pika.BlockingConnection(pika.URLParameters(CONFIG["amqp_url"])) as conn:
        conn.channel().basic_publish(
            exchange="fleet",
            routing_key="device.status.changed",
            body=json.dumps({
                "serial": serial,
                "status": status,
                "limitingFactors": limiting_factors,
                "observedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            }),
            properties=pika.BasicProperties(message_id=f"chg_e2e_{uuid.uuid4().hex[:12]}", content_type="application/json"),
        )


def availability_once_written(vehicle_id, timeout_s=20):
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        res = get(f"{CONFIG['partner_url']}/v1/vehicles/{vehicle_id}/availability")
        if res["status"] == 200:
            return res["body"]["available"]
        time.sleep(0.25)
    return None
