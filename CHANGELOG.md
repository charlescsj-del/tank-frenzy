# Changelog

Record user-visible additions, balance changes and fixes here with each release. Release versions must match `shared.js`, `package.json` and `package-lock.json`.

## 1.2.0

### Audio

- Added the approved cartoon sound samples: layered destruction, cannon pops, paired double-gun pops, machine-gun ticks, laser zaps, metallic ricochets, interception sparks and hull impacts.
- Added the previewed menu, match-start, victory and defeat cues. Immortal, Restore and Speed have distinct pickup sounds; weapon pickups use their matching weapon sound.
- Packed the approved sounds into one cached 170 KiB MP3 asset. Machine-gun fire uses one tick from the auditioned burst per real shot; the two events from a double shot trigger only one paired sound.
- Added distance attenuation, subtle stereo positioning, small shot/ricochet pitch variation, and quieter combat/engine audio beneath result fanfares.
- Limited sample playback to 12 simultaneous voices with priority for important cues and rate limits for noisy bursts. Original synth effects remain as bounded fallbacks while the audio loads or if loading fails.
- Sound Off, leaving, and hiding the page stop active effects, including long explosions and queued synth notes. Loading a sound never replays an old event later.
- Preserved muted normal local firing, the local engine sound and existing laser audibility.

### Performance

- Samples download and decode once per page session after audio is activated. All mixing runs in the browser. No gameplay snapshot fields, simulation timers or per-room server work were added.

## 1.1.1

### Fixed

- Corrected the SVG viewport for the active-power badge and all six power-guide icons. Symbols were offset into the bottom-right corner and clipped, leaving mostly a colored tile instead of the collected power's shape.
- Explicitly sized each symbol instance so its full shape is centered within the badge. Preserved icon animation and the remaining-time display.

### Documentation

- Added `SOUND_DESIGN.md` to explore a cartoon arcade sound direction. Audio behavior is unchanged in this patch.

## 1.1.0

### Added

- Version badge in the bottom-right corner of the main room browser.
- **Immortal** pickup: star icon, 10 seconds of protection from incoming damage, and animated stars around the tank. Moving and firing remain available. Collecting another timed power replaces it.
- **Restore** pickup: red heart icon and instant restoration to maximum health. Preserves an existing timed power without extending its duration; shows a brief heart on collection.
- This repository changelog.

### Changed

- Tank health doubled from 5 to 10. Normal shells still deal 1 damage. Spawning and respawning restore 10 health.
- Five compact HUD pips each hold two health, with half-filled pips for odd health values.
- Laser damage increased from 2 to 5. A full-health, unprotected tank now takes two laser hits.
- A laser clears every enemy bullet intersecting its path before the first tank or cover. Friendly and own bullets remain untouched.
- Power-up guide now explains all six pickups.

### Fixed

- Laser visuals start at the barrel opening, using the same projected muzzle and aim as the rendered turret, including interpolation and touch aiming.
- A laser stops at the first enemy tank, including an invulnerable tank, and cannot fire through nearby cover when its barrel overlaps it.
- Preserved and regression-tested 2 vs 2 pass-through: bullets and lasers pass through teammates; teammates' bullets do not intercept one another.

### Performance

- Existing four-player, two-pickup and 96-shell room limits remain in place. Laser bullet clearing is a bounded scan per laser shot; Immortal and Restore add no background jobs.

## 1.0.0 — Previous baseline

- Tank Frenzy branding, cartoon battlefield and illustrated lobby, animated power icons and countdowns.
- Menu, round-start, pickup, victory and defeat audio cues; louder destruction effects.
- Free-for-All and 2 vs 2 rooms, room discovery, player previews, and optional bouncing bullets and powers.
- Laser, double gun, speed and machine gun pickups.
- Enemy bullet interception, leave confirmation, and a compact mobile HUD with a following camera and twin-stick controls.
