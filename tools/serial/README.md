# Serial capture (evidence from real boards)

Reads a board's USB Serial output and saves it as evidence that `tools/mock/trace_record.py` can check. **Read-only:** it never writes to the board and never flashes firmware.

1. Owners print one line per event (format: `docs/interface/SERIAL_LOG_FORMAT.md`).
2. Plug the board into the PC with a **data** USB cable. Close the Arduino/PlatformIO Serial Monitor (only one program can use the port).
3. `py -m pip install pyserial` (once, only for live capture)
4. `py tools/serial/capture_serial.py --list-ports`
5. `py tools/serial/capture_serial.py --port COM5 --role node --out node.jsonl --raw node_raw.txt`
6. Do the same for the Gateway (`--role gateway`, another port or another run).
7. `py tools/mock/trace_record.py --source NODE_01 --seq 42 --node-log node.jsonl --gateway-log gw.jsonl`

Try it without a board: `py tools/serial/capture_serial.py --from-file tools/serial/sample_node.txt --role node --out out.jsonl`

If a printed `hex=` disagrees with the printed `node`/`seq`, or does not decode as a valid frame, the tool flags it. That catches serializer bugs early.

**Status:** parser, hex check and replay are tested (`py -m unittest discover -s tools/serial -v`). Live COM-port capture has **not** been tested on a real board yet.
