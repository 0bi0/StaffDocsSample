---
title: 1. Polar
---
>[!warning]
>[Polar](https://polar.top/) is the best publicly available anticheat. They take their security extremely seriously to prevent cheaters from gaining information that could benefit them in bypassing. Hence it's so important you DONT share anticheat logs with someone outside of the staff team.

## Introduction
Polar is an anticheat that does both calculation on the server while someone is playing, as well as using external servers to run machine learning models to determine if someone is moving or fighting in a way they deem suspicious. This is the reason why you sometimes see alerts being sent in chat while the player is not even moving. They have before, and the machine learning models have completed their predictions resulting in a delayed alert being send.

### Player Logs
In order to retrieve logs from a specific player there are multiple ways of doing so. To gain general information about a player you can run

```bash
/polarlogs info <username>
```

To get more details about what a player was specifically flagging you can run:
```bash
/polarlogs view p:<username> [page]
```

More information about the specific alerts can be found on the [[AntiCheat/Polar/flags]] page.