#!/usr/bin/env python3
"""
netsim_proxy.py - cross-platform (Mac + Linux) low-bandwidth / no-service simulator.
Pure Python 3 standard library, no root needed.

It is a TCP proxy: point server A at the proxy instead of at server B, and the
proxy forwards to B while degrading the link.

  python3 netsim_proxy.py --listen 9000 --target 127.0.0.1:8000

Then make A talk to localhost:9000 (e.g. set the backend URL env var to it).
Run a second instance in the other direction if you want both ways shaped.

Hotkeys:  n normal | l ~1 bar | o no service (0-1 bars) | f flaky | x hard dead | q quit
"""
import argparse, asyncio, random, sys, time, termios, tty

# delay/jitter in seconds, rate in bytes/sec (None = unlimited),
# stall_p = chance a chunk gets an extra "retransmit" stall,
# refuse_p = chance a NEW connection is dropped, reset_p = chance a chunk kills the connection.
PROFILES = {
    "normal":   dict(bars="▂▄▆█", delay=0.0, jitter=0.0, rate=None, stall_p=0.0,  refuse_p=0.0,  reset_p=0.0),
    "low":      dict(bars="▂▁▁▁", delay=1.2, jitter=0.4, rate=2000, stall_p=0.20, refuse_p=0.10, reset_p=0.002),
    "nosignal": dict(bars="▁▁▁▁", delay=3.0, jitter=1.0, rate=500,  stall_p=0.90, refuse_p=0.70, reset_p=0.02),
    "crawl":    dict(bars="▂▁▁▁", delay=1.5, jitter=0.6, rate=1500, stall_p=0.30, refuse_p=0.30, reset_p=0.005),
    "spark":    dict(bars="▂▄▁▁", delay=0.5, jitter=0.25, rate=6000, stall_p=0.08, refuse_p=0.0,  reset_p=0.0),
    "dead":     dict(bars="✕   ", delay=0.0, jitter=0.0, rate=None, stall_p=0.0,  refuse_p=1.0,  reset_p=1.0),
}
LABELS = {"normal": "NORMAL", "low": "LOW BANDWIDTH (~1 bar)", "nosignal": "NO SERVICE (0-1 bars)",
          "dead": "HARD OUTAGE", "flaky": "FLAKY (very bad wifi + sparks)"}

state = {"profile": "normal", "mode": "normal", "flaky_task": None}
P = lambda: PROFILES[state["profile"]]


def announce(text):
    print(f"\r[{time.strftime('%H:%M:%S')}] {P()['bars']}  {text}", flush=True)


async def pump(reader, writer):
    """Move bytes one way: delay (pipelined), throttle, stall, maybe reset."""
    q = asyncio.Queue()
    last_release = 0.0

    async def read_side():
        nonlocal last_release
        try:
            while True:
                chunk = await reader.read(1024)
                if not chunk:
                    break
                p = P()
                release = time.monotonic() + max(0, p["delay"] + random.uniform(-p["jitter"], p["jitter"]))
                if random.random() < p["stall_p"]:
                    release += random.uniform(0.5, 2.0)      # fake TCP retransmit timeout
                release = max(release, last_release)         # keep byte order
                last_release = release
                await q.put((release, chunk))
        finally:
            await q.put(None)

    async def write_side():
        while True:
            item = await q.get()
            if item is None:
                break
            release, chunk = item
            wait = release - time.monotonic()
            if wait > 0:
                await asyncio.sleep(wait)
            p = P()
            if state["profile"] == "dead" or random.random() < p["reset_p"]:
                raise ConnectionResetError
            if p["rate"]:
                await asyncio.sleep(len(chunk) / p["rate"])
            writer.write(chunk)
            await writer.drain()

    rt = asyncio.create_task(read_side())
    try:
        await write_side()
    except (ConnectionError, asyncio.CancelledError):
        pass
    finally:
        rt.cancel()
        writer.close()


async def handle(client_r, client_w, target):
    p = P()
    if random.random() < p["refuse_p"]:
        await asyncio.sleep(random.uniform(0, p["delay"]))   # connection attempt hangs, then fails
        client_w.close()
        return
    await asyncio.sleep(max(0, p["delay"]))                  # handshake latency
    try:
        up_r, up_w = await asyncio.open_connection(*target)
    except OSError:
        client_w.close()
        return
    await asyncio.gather(pump(client_r, up_w), pump(up_r, client_w))


async def flaky_loop():
    """Mostly dead or crawling, with random sparks where small things can load."""
    while True:
        roll = random.randint(0, 9)
        if roll < 5:
            state["profile"] = "nosignal"; announce("[flaky] 0 bars"); await asyncio.sleep(random.uniform(4, 11))
        elif roll < 8:
            state["profile"] = "crawl";    announce("[flaky] 1 bar (crawling)"); await asyncio.sleep(random.uniform(3, 7))
        else:
            state["profile"] = "spark";    announce("[flaky] spark! (window to load)"); await asyncio.sleep(random.uniform(2, 5))


def set_mode(mode):
    t = state["flaky_task"]
    if t:
        t.cancel(); state["flaky_task"] = None
    state["mode"] = mode
    if mode == "flaky":
        state["flaky_task"] = asyncio.get_running_loop().create_task(flaky_loop())
        announce(LABELS[mode])
    else:
        state["profile"] = mode
        announce(LABELS[mode])


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--listen", type=int, required=True, help="local port to listen on")
    ap.add_argument("--target", required=True, help="host:port of the real server")
    ap.add_argument("--host", default="127.0.0.1", help="listen address (0.0.0.0 to accept from other machines)")
    ap.add_argument("--mode", default="normal", choices=["normal", "low", "nosignal", "dead", "flaky"])
    a = ap.parse_args()
    th, tp = a.target.rsplit(":", 1)
    target = (th, int(tp))

    server = await asyncio.start_server(lambda r, w: handle(r, w, target), a.host, a.listen)
    print(f"Proxy {a.host}:{a.listen} -> {th}:{tp}")
    print("Keys: n normal | l ~1 bar | o no service | f flaky | x hard dead | q quit")
    set_mode(a.mode)

    keymap = {"n": "normal", "l": "low", "o": "nosignal", "f": "flaky", "x": "dead"}
    stop = asyncio.Event()
    if sys.stdin.isatty():
        fd = sys.stdin.fileno()
        old = termios.tcgetattr(fd)
        tty.setcbreak(fd)

        def on_key():
            k = sys.stdin.read(1).lower()
            if k == "q":
                stop.set()
            elif k in keymap:
                set_mode(keymap[k])
        asyncio.get_running_loop().add_reader(fd, on_key)
    try:
        async with server:
            await stop.wait()
    finally:
        if sys.stdin.isatty():
            termios.tcsetattr(fd, termios.TCSADRAIN, old)
        print("\nStopped.")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
