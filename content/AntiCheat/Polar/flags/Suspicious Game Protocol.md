---
title: Suspicious Game Protocol
---
> [!tip]  
> This check category is more complex than most. For full context, make sure to read the section below: **“What is ‘Suspicious Game Protocol’ / ‘INVALID_PROTOCOL’.”**

## Prefix
<span style="color:#6ea2e2;">Polar</span> <span style="color:light_gray;">&gt;</span> <span style="color:#6ea2e2;">DevBram</span> <span style="color:#b7cfed;">Suspicious game protocol</span>

---
## What is "Suspicious Game Protocol" / "INVALID_PROTOCOL"

### Game Protocol Overview

The Minecraft client and server communicate through the **game protocol**, a defined set of rules for how information is exchanged.

Every in-game action, movement, eating, attacking, breaking blocks. results in the client sending **packets** to the server.  

Examples:
- Eating sends a packet stating the player has begun eating.
- Swinging an arm sends a swing animation packet.
- Hitting an entity sends both a swing animation packet and a hit packet.

The protocol ensures the server receives consistent, structured information about what the client is doing.

### Why this matters for this category

Minecraft only performs basic validation on packets.  
An anticheat performs much deeper validation to ensure players aren’t doing things that are impossible in normal gameplay.

For example, when hitting another player, a legitimate client **must** send:

- a swing animation packet, and
- a hit packet.

If a player deals damage without the required swing packet, the behaviour is not possible in vanilla Minecraft. This usually indicates a hacked client or a broken mod that constructs packets incorrectly.

**Suspicious Game Protocol** or **INVALID_PROTOCOL** is flagged when the anticheat detects packets that are:

- missing,
- out of order,
- inconsistent with expected behaviour, or
- otherwise impossible under the standard protocol.

---
## Detail Explanation

Polar Anticheat is closed-source, so we can’t see how every check works internally. When a player is banned for **INVALID_PROTOCOL**, Polar _often_ adds extra details showing **which specific protocol check** they failed, but these details **do not show up in the `/polar logs` command**.

**Staff should always check Discord instead.**

To see what the player flagged for:

1. Go to the `#anticheat` channel on Discord.
2. Search for the player’s username.
3. Look for messages with details like **(Duplicated slot)**, **(Slot place)**, etc.

If the details are present, Discord will show them.  
If no details appear, then Polar detected an invalid protocol, but didn’t specify which check.

---
## Duplicated Slot

<span style="color:#6ea2e2;">Polar</span> <span style="color:light_gray;">&gt;</span> <span style="color:#6ea2e2;">DevBram</span> <span style="color:#b7cfed;">Suspicious game protocol</span> <span style="color:light_gray;">(Duplicated slot)</span>

Your game notifies the server when the player changes their hotbar slot. The important detail is that the client only sends a packet **when switching to a different slot**. Vanilla Minecraft never sends a packet to switch to a slot it was already on.

Because of this, the server can simply remember the last slot it received from the player. If the next change slot packet reports the **same slot as last time**, the client is doing something impossible in vanilla, which strongly suggests a cheat or a broken mod.

Some cheats are poorly written and will trigger this check. Unfortunately, there is also at least one mod commonly used in the crystal PvP scene (we are trying to figure out which one) that sends invalid duplicate-slot packets as well. Since this still isn’t valid vanilla behavior, it will also flag.

If a player only flags for “Duplicated Slot” and nothing else, ask them for a screenshot of their mod folder. If their mods look normal, you can unban them.