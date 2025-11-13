---
title: Infrastructure
---

> ℹ️ This page contains some technical details about our infrastructure.

## **Hardware**
- **2× Hetzner AX102 dedicated servers**
- **1× OVH VPS** (used as the VoiceChat proxy)

## **Software Stack**
- **Proxy:** Velocity 3.4.0-SNAPSHOT
- **Server:** UniverseSpigot
- **Minecraft Version:** 1.21.4
- **Voice Chat:** Simple Voice Chat 2.6.6
- **Anti-Cheat:** GrimAC (V2) + TotemGuard

## **Infrastructure Locations**
- **DDoS Mitigation Edge Locations:** Multiple worldwide locations (including Frankfurt)
- **PvPHub Servers:** Nürnberg

## **Routing**
When a player connects to **`pvphub.me`**, their DNS resolver returns the IP of one of the **global DDoS mitigation edge nodes** (for example Frankfurt). The player connects to that edge location first. This edge node filters and blocks DDoS traffic. After filtering, the legitimate player connection is forwarded to our Velocity proxy in **Nürnberg**.

## **VoiceChat Proxy**
Our main DDoS mitigation layer only supports the **HAProxy protocol**, which works for Minecraft but **not** for the direct UDP/TCP connections used by Simple Voice Chat.

To keep our backend IP hidden and still support VoiceChat, we use a **separate VoiceChat proxy**:

1. The player joins the Minecraft server through the global DDoS mitigation edge. 
2. Once connected, the VoiceChat plugin instructs the client to connect to `voice.pvphub.me` for the audio channel.
3. `voice.pvphub.me` resolves to our **OVH VPS**, not the backend server.
4. The VPS then creates a secure backend connection to the actual VoiceChat port on our Nürnberg server.