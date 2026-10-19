![Nexus Care logo](https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/605/827/datas/original.png "Nexus Care logo")

## Inspiration

In remote regions like the Sub-Saharan bush, the Amazon, and the far north, a patient can be **six hours of unpaved road** from the nearest hospital. Strokes, high-risk pregnancies, sepsis, and infected wounds turn fatal inside the golden hour. The small clinics meant to catch these cases are understaffed, short on diagnostics, and sit on connections where cloud telehealth simply fails.

We asked a different question. Instead of "how do we get these clinics online?", we asked: _what if the system assumed the network never works?_

## What it does

Nexus Care turns the cheap tablets already in rural outposts into an **offline-first coordination network**. It has four working parts.

**1. A clinic network that never waits on a connection.** Every action, such as logging oxygen or requesting a transfer, is saved on the device first. Clinics share changes whenever a link allows, and a clinic that has been offline simply catches up.

**2. An SMS triage gatekeeper for people without smartphones.** A patient answers numbered menus: area, danger signs, main problem, how long, and whether they need an ambulance. Any danger sign returns a high-priority code like `RED-772K`. A mild case gets home-care advice. The clinic dashboard shows each patient's answers, and the code can be checked at the desk with no connection.

**3. A five-tier escalation ladder.** The system treats supply problems by how urgent they are:

1. **Stock low:** routine sync, queued.
2. **Critically low:** ask a neighboring clinic.
3. **Zero stock:** a targeted request, flagged urgent.
4. **Active patient crisis:** an emergency alert that skips the queue and puts a red banner on every other clinic, with how much stock they hold and how far away the sender is.
5. **Mass-casualty event:** a regional load-balancing plan, such as "keep 2 here, send 4 to Clinic C, send 2 to Clinic D", worked out on the device from the last known free beds with no connection needed.

**4. An on-device disease scanner.** Stroke and burn image models run in the browser, so no patient image ever leaves the device, retaining confidentiality.

## How we built it

**Front end:** Next.js, React, TypeScript, and Tailwind, designed in Figma. **Hub:** FastAPI and SQLite in write-ahead-log mode, with strict input validation. **ML:** fine-tuned PyTorch models converted to LiteRT, running in the browser through WebGPU with a WebAssembly fallback.

What sits underneath is more interesting than the screens:

- **An append-only ledger instead of a shared database.** Each change is a small immutable entry of a few hundred bytes. Merging two clinics' data is a set union, and duplicates are ignored. Every transport is therefore safe to retry or repeat, and the hub is just a relay.
- **Conflicts resolved without trusting clocks.** Tablet clocks drift, so edits are ordered by Lamport clocks with a device-ID tiebreak. Every tablet computes the same winner, with no server deciding.
- **Gentle on cheap hardware.** Sync sends only unsent entries in small chunks and pulls only what is newer than its cursor. It runs on events (three seconds after a change, coming online, app on screen), not a constant poll, and a failed attempt never loops.
- **Data by file.** With no signal at all, a clinic exports everything to a file, carries it on a supply truck or USB stick, and imports it elsewhere. Importing the same file twice is safe.
- **Network data treated as hostile.** Entries from other devices are shape-checked and length-capped before they touch the screen, and the hub enforces size limits.
- **SMS triage that cannot fail dangerously.** Numbered menus mean no free-text guessing. The rules live in a JSON file, so a clinician can change the protocol without touching code. Safety is enforced in code regardless of the rules: any danger sign is urgent, unclear replies escalate instead of stalling a patient, every home-care message ends with a danger-sign warning, and every reply fits one 160-character SMS in the plain alphabet every phone supports.
- **Privacy by construction.** Phone numbers are never stored, only a keyed hash. Codes end in an HMAC check letter, so guessed codes fail.
- **Tested.** More than 50 automated tests cover the triage engine, including checks that every danger sign produces an urgent code and every reply fits one SMS.
- **A network simulator we built ourselves.** Our proxy degrades the link with multi-second latency, a bandwidth cap near 4 kbit/s, stalled and refused connections, and a "flaky" mode that cycles between dead signal and brief sparks. A second tool does real packet shaping on Linux. Hotkeys switch between normal, one-bar, no-service, and hard-dead live.

## Challenges we ran into

- **Making two clinics agree with no authority.** Ordering conflicting edits without trusting any clock took a design change.
- **Making SMS triage safe.** A health tool cannot stall or guess, so unclear answers escalate to "see a clinic today" instead of looping.
- **Simulating bad networks honestly.** TCP never silently drops bytes, so we modeled loss as stalls, refusals, and resets, which is how it feels to a real client.
- **Tuning the image models** to be accurate enough to be useful, and connecting the front and back ends.

## Accomplishments that we're proud of

- A working end-to-end prototype, built in under three days.
- **87.41% accuracy** on our stroke detection model and **79.30%** on burn classification, on final production tests.
- Tiny payloads: an emergency alert is a couple hundred bytes, and a patient's whole SMS exchange fits in single texts.
- A demo where we can drop from normal to dead network mid-sentence and nothing is lost.

## What we learned

How to build a distributed system with no trusted clock and no always-on server, how to constrain a medical-adjacent flow so it fails safe, and how to turn a fine-tuned PyTorch model into something that runs in a browser.

## What's next for Nexus Care

- **Peer-to-peer supply fulfilment:** a button that lets a clinic with spare stock send it to one that needs it, updating both counts.
- **A real SMS gateway and radio.** The hub already accepts texts and the sync layer is built around swappable transports, so LoRa is the next one.
- **Push alerts instead of polling,** and priority sync that sends urgent changes first.
- **Bundling the AI runtime locally** so the scanner works fully offline from the first load.
- **Per-clinic accounts, signed entries, and a clinician-approved protocol.** The current rules are demo-only and not a medical device.
