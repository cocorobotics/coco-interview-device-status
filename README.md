# hangry-hippo-integration

Keeps HangryHippo's view of our robots' availability in sync with Fleet.

HangryHippo is a marketplace for delivering watermelons to hippos at zoos and
wildlife parks. Its dispatcher assigns a delivery to one of our robots only if
we have marked that robot available. This service consumes the status changes
Fleet publishes, decides whether each robot is available, and writes that to
HangryHippo's Supply API.

**Status:** scaffolding only. Each language skeleton connects, consumes, parses
and acks, and does nothing else yet.

```mermaid
flowchart LR
  Robots -->|telemetry| Fleet
  Fleet -->|device.status.changed| Q[(device-status queue)]
  Q --> S[hangry-hippo-integration<br/>this service]
  S -->|serial to vehicle id| Fleet
  S -->|PUT availability| HH[HangryHippo Supply API]
  HH -->|assigns deliveries to available robots| D[HangryHippo dispatcher]

  classDef editable fill:#d1fae5,stroke:#059669,stroke-width:2px,color:#064e3b
  classDef partner fill:#fde68a,stroke:#b45309,color:#78350f
  class S editable
  class HH,D partner
```

Green is this service, the only box you change. Amber is HangryHippo's.

## Getting started

```
make up           # broker, the Fleet emulator and the HangryHippo sandbox
make run go       # or typescript, python, csharp, java
```

We have not settled on a language for this service, so there is a skeleton for
each one we run elsewhere. They are equivalent; use the one you are most
productive in.

## The device-status queue

RabbitMQ on `localhost:5672`, management UI on
[localhost:15672](http://localhost:15672) with `guest` / `guest`. The
`device-status` queue already exists, so you only have to consume.

A message:

```
message_id:   chg_4f1a9c02be71
content_type: application/json

{
  "serial": "C10393",
  "status": "ONLINE",
  "limitingFactors": ["LOW_BATTERY"],
  "observedAt": "2026-09-24T17:02:11.482Z"
}
```

`status` is `ONLINE` or `OFFLINE`. `limitingFactors` is a possibly empty list of
reasons the robot may be unavailable. `message_id` identifies the status change;
`observedAt` is when Fleet saw it, as an RFC 3339 timestamp in UTC with
millisecond precision. A message rejected without requeue goes to
`device-status.dlq`.

## Fleet, `localhost:4001`

Owns the state of every robot.

| Endpoint | Returns |
|---|---|
| `GET /v1/devices/{serial}` | Fleet's current record for a robot: `serial`, `status`, `limitingFactors`, `observedAt`, `hub`. 404 if unknown. |
| `GET /v1/devices/{serial}/partner-accounts/hangry-hippo` | The robot's HangryHippo account: `serial`, `partner`, `vehicleId`. 404 if the serial is unknown or the robot is not registered with HangryHippo. |
| `GET /v1/devices` | Every seeded robot. Useful for finding serials to test with. |
| `GET /v1/health` | |

## HangryHippo Supply API, `localhost:4002`

HangryHippo's platform. We do not own it and we cannot change it. It calls our
robots vehicles, identified by its own vehicle ids; Fleet maps a serial to one.

**`PUT /v1/vehicles/{vehicleId}/availability`** sets whether HangryHippo may
assign deliveries to that vehicle. Typically takes 600 to 800ms. 404 if the
vehicle id is unknown, 503 when HangryHippo is shedding load.

```
PUT /v1/vehicles/veh_8f21c4/availability
{ "available": true }

204 No Content
```

**`GET /v1/vehicles/{vehicleId}/availability`** is what HangryHippo currently
believes. 404 before anything has been written.

## Commands

```
make run go              # start the consumer. also typescript, python, csharp, java
make test go             # unit tests
make test go e2e         # end to end tests, against the whole stack
make state               # queue depth, what Fleet published, what HangryHippo received
make reset               # clear HangryHippo's state and purge the queues
make traffic-off         # stop Fleet publishing, for a quiet read. traffic-on resumes
make logs                # logs from the Fleet emulator and the HangryHippo sandbox
make shell               # a terminal in the container, for a package install
```

`make` runs everything in a container on the stack's network, so the `localhost`
addresses above work as written; edit on the host as normal. The Fleet emulator
and the HangryHippo sandbox come from a prebuilt image, and this README is their
contract.

## Testing

Each skeleton comes with one starter test per level. They show where tests live
and how to reach the stack from them. What you test, and at which level, is up
to you.

| Level | Exercises | Needs |
|---|---|---|
| unit | the code on its own, with anything external faked | the dev container only |
| e2e | the whole path: a status change published to the `fleet` exchange, through the consumer, to what HangryHippo ends up believing | `make up`, and `make run` stopped |

### How an e2e run works

`make test <lang> e2e` starts your consumer, runs the e2e tests against it, and
stops it. If a test fails, the tail of the consumer's output follows the
results.

Each test pauses Fleet's traffic, purges `device-status` and clears
HangryHippo's state, then publishes a status change. Helpers for those steps,
and wrappers for the Fleet partner-account and HangryHippo availability `GET`s,
sit in a file beside the tests.

Tests run one at a time. Your consumer keeps running between them, so anything
it holds in memory carries over. Fleet maps `C10393` to `veh_8f21c4`;
`GET /v1/devices` lists the other robots.
