# netsim: low-bandwidth network simulator

Demo tooling for showing that Nexus keeps working in low-bandwidth and no-service regions. It degrades the connection between two parts of the system (for example the frontend and the hub backend, or two hub servers) so you can switch conditions live during a demo.

There are two tools. Pick the one that fits your setup.

| | `netsim_proxy.py` | `netsim.sh` |
|---|---|---|
| Works on | macOS and Linux | Linux only |
| Needs root | No | Yes |
| App changes | Point the app at the proxy port | None |
| How it works | TCP proxy that simulates delay, throttling, stalls, and resets | Real packet loss, latency, and bandwidth limits via `tc netem` |
| Best for | Day-to-day demos on a laptop | Two real Linux machines, VMs, or containers |

## Modes

Both tools share the same modes and hotkeys.

| Key | Mode | Approximate behavior |
|---|---|---|
| `n` | Normal | No degradation |
| `l` | Low bandwidth (~1 bar) | ~1.2s latency, ~20% loss/stalls, ~16 kbit/s |
| `o` | No service (0-1 bars) | ~3s latency, ~90% loss/stalls, ~4 kbit/s. Almost dead, the odd request squeezes through |
| `f` | Flaky | Very bad wifi. Random cycle of 0 bars (4-11s), crawling 1 bar (3-7s), and short "sparks" (2-5s) where small requests can finish |
| `x` | Hard dead | Nothing gets through at all |
| `q` | Quit | Stops the tool and restores normal networking |

Flaky mode prints the current state, so you can narrate what is happening as the signal drops and recovers.

## Option 1: `netsim_proxy.py` (macOS and Linux)

Requires Python 3. No extra packages and no root.

```bash
python3 tools/netsim/netsim_proxy.py --listen 9000 --target 127.0.0.1:8000
```

- `--listen` is the port the proxy opens.
- `--target` is the real server (`host:port`).
- `--host` is the address to listen on (default `127.0.0.1`). Use `0.0.0.0` if another machine needs to reach the proxy.
- `--mode` is the starting mode (`normal`, `low`, `nosignal`, `dead`, `flaky`). Default is `normal`.

Then point the client at the proxy instead of at the real server. For example, if the backend normally runs on port 8000, set the backend URL used by `nexus-care` to `http://localhost:9000` for the demo.

```
# nexus-care/.env.local  (use whatever variable name your app reads)
NEXT_PUBLIC_API_URL=http://localhost:9000
```

Restart the frontend after changing the env file. Switch it back to the real port when the demo is over.

To shape both directions, run a second instance in the other direction.

## Option 2: `netsim.sh` (Linux only)

Requires `iproute2` (`tc`) and root. Run it on each server and point it at the other one:

```bash
chmod +x tools/netsim/netsim.sh
sudo tools/netsim/netsim.sh eth0 10.0.0.2
```

- First argument: your network interface (find it with `ip a`).
- Second argument: the IP of the other server.

Only traffic to that peer IP is shaped, so SSH and other connections keep working. Shaping applies to outgoing traffic only, so run it on both servers for both directions.

One-shot commands (no hotkeys):

```bash
sudo tools/netsim/netsim.sh eth0 10.0.0.2 low        # ~1 bar
sudo tools/netsim/netsim.sh eth0 10.0.0.2 nosignal   # 0-1 bars
sudo tools/netsim/netsim.sh eth0 10.0.0.2 dead       # hard outage
sudo tools/netsim/netsim.sh eth0 10.0.0.2 normal     # restore everything
sudo tools/netsim/netsim.sh eth0 10.0.0.2 status     # show current rules
```

If the script is ever killed uncleanly, run the `normal` command to remove the rules.

Containers: add `--cap-add=NET_ADMIN` and install `iproute2` inside the container, then run the script there.

## Demo script

1. Start the hub backend and the frontend, and confirm everything works at full speed.
2. Start the simulator (proxy or `tc` script). Keep its terminal visible, since the signal bars and mode text help the audience follow along. A `ping` pane alongside shows latency changes too.
3. **Normal (`n`):** create a record and show it syncing instantly. This is the baseline.
4. **~1 bar (`l`):** create another record. It still syncs, but slowly. This is what a rural connection looks like.
5. **No service (`o`):** keep creating records. The app keeps working locally, nothing is lost, and the sync queue grows.
6. **Flaky (`f`):** narrate as the signal drops and sparks. Queued records trickle through whenever a spark lets them.
7. **Normal (`n`):** everything catches up and both sides match.
8. Press `q` to clean up.

Tips:

- Rehearse the full flow at least once before presenting, and test on your own network rather than venue wifi.
- Record a short backup video of a good run in case something fails live.
- With the `tc` script, keep SSH on a separate interface or rely on the peer-IP filter so you cannot lock yourself out.
- Make sure the app retries failed syncs rather than giving up. At 0-1 bars many new connections will fail by design.

## Tuning

- `netsim.sh`: edit the `LOW`, `NOSIGNAL`, `DEAD`, `CRAWL`, and `SPARK` variables at the top, and the `sleep` ranges in `flaky_loop`.
- `netsim_proxy.py`: edit the `PROFILES` dictionary at the top (`delay`, `jitter`, `rate` in bytes/sec, `stall_p`, `refuse_p`, `reset_p`) and the timing ranges in `flaky_loop`.

## Limitations

- The proxy simulates degradation at the TCP level, so it is a close approximation, not true packet loss. Use `netsim.sh` on Linux when you need the real thing.
- Signal bars are an approximation. The numbers are chosen to feel like 0-1 bars of mobile or wifi service, not measured from a specific carrier.
- Linux only for `netsim.sh`. `tc netem` does not exist on macOS.
