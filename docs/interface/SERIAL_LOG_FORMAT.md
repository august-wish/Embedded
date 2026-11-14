# Serial Log Line Format (proposed, for test evidence)

**Status:** PROPOSED, optional. It is not part of the wire contract. It only makes test evidence easy to capture and check. Owners may print more lines of their own; lines that don't start with one of the keywords below are ignored.

**Why:** the integrator's tool `tools/serial/capture_serial.py` reads a board's Serial output (USB) and turns these lines into a log that `tools/mock/trace_record.py` can check. One agreed line per event = no manual copy-paste, no typos.

## Lines

One line per event. Keywords are upper-case. Fields are `key=value`, separated by single spaces, no spaces inside values.

| Line | Printed by | When | Example |
|---|---|---|---|
| `TX` | Node | each time a telemetry frame is sent (also on a retry) | `TX node=1 seq=125 dist_cm=46.2 attempt=0 hex=4353010101004D3C2B1A7D000000F4F50100CE0114008200D4030B00FCFF06000300` |
| `ACK` | Node | when the Gateway's ACK arrives | `ACK node=1 seq=125 status=accepted` |
| `RX` | Gateway | each time a Node frame is received and decoded | `RX node=1 seq=125 dist_cm=46.2 ack=accepted hex=4353...` |
| `UP` | Gateway | after an upload attempt to the cloud | `UP node=1 seq=125 status=201 record_id=GW_01:NODE_01:BOOT_1A2B3C4D:125` |

## Fields

| Field | Meaning | Required |
|---|---|---|
| `node` | numeric node id (1 = NODE_01) | yes |
| `seq` | message counter from the packet | yes |
| `dist_cm` | distance in cm, or `invalid` if the sensor timed out (never 0) | on `TX`, `RX` |
| `attempt` | 0 for first send, 1.. for retries | optional |
| `ack` | Gateway result: `accepted`, `duplicate`, `rejected` | on `RX` |
| `status` | on `ACK`: `accepted`/`duplicate`/`rejected`. On `UP`: HTTP status (e.g. `201`) or `fail` | yes |
| `record_id` | cloud record id, if the firmware builds one | optional |
| `hex` | the frame as hex without spaces. If given, the tool decodes it and checks `node`/`seq` against it | optional but very useful |

## Minimum for the checkpoint
- Node prints `TX` for each send. (`ACK` if the ACK is implemented.)
- Gateway prints `RX` for each received packet. (`UP` once the upload works.)

If your firmware cannot print `hex`, leave it out. The tool does not require it.

## Example output of a short run
```text
TX node=1 seq=41 dist_cm=52.3 attempt=0
ACK node=1 seq=41 status=accepted
TX node=1 seq=42 dist_cm=48.9 attempt=0
TX node=1 seq=42 dist_cm=48.9 attempt=1
ACK node=1 seq=42 status=accepted
```
