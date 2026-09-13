# IRON / FIELD - Network Arena

## Host

Run `npm install` once, then `npm start` in this folder (Node.js 18 or later).
Open http://localhost:8765. The terminal also prints the host's network addresses.
Keep the server running during play. Stop it with Ctrl+C.

## Join

Each player opens the host's address in a separate tab, browser, or device, enters a name, and joins the same room code. Two to four players can battle in a room; one player can practice while waiting. Different room codes create separate matches. The Copy Invite button includes the room code.

On other devices, use the host's LAN address, not localhost. Both devices must be able to reach each other on the network. If Windows prompts for Node.js network access, allow it on your trusted private network. No firewall rules are changed by this project. Public Internet play requires hosting this server somewhere players can reach; no public deployment or router forwarding is configured here.

Maps are 1600 by 1040 world units (about 2.5 times the previous area). Each room gets a random map, regenerated for every new match. Clear spawn zones and connected lanes keep the arena traversable. All players receive the same map from the server.

## Controls and Rules

- W/A/S/D: move up/left/down/right along the unrotated map axes, including diagonal movement.
- Audio: your own moving tank's engine and track sound, plus opponents' firing sounds. Your own firing sound is muted; impacts and ricochets remain audible.
- Shell range covers the full map diagonal, and shots into nearby cover ricochet from the barrel's last clear point.
- Mouse pointer: aim the turret independently of movement.
- Left click: fire. Hold to keep firing, with a 0.42-second cooldown between shots.
- Five hits destroy a tank; respawn takes three seconds.
- New spawns have a two-second shield, which ends early if they fire.
- First to ten kills wins; a new match starts automatically after ten seconds.
- Leaving the tab stops your controls, but other players keep playing.
- A brief connection loss reserves your tank for 15 seconds and reconnects automatically. Reloading or leaving creates a new player session.

The server owns movement, collision, firing cooldowns, health, scoring, and respawns. Browsers send input over WebSocket and render shared snapshots. No user accounts or database are required; match state resets when the server stops.

## Checks

Run `npm test` for simulation and real WebSocket integration checks.

