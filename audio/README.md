# Approved cartoon sound pack

`cartoon-v1.mp3` contains the original synthesized effects from the user's approved sound audition. It is a mono 44.1 kHz / 128 kbps MP3, 174,333 bytes. No third-party recordings or external audio service are used.

The source samples were generated with oscillators, filtered noise, short melodic phrases and layered percussion. The pack preserves the approved waveforms, removes only the audition's outer silence, and adds short silent gaps between clips. Clip offsets and durations are stored in `sound-bank.js`.

Included clips: menu, start, cannon, double gun, machine-gun burst, laser, ricochet, interception, hit, explosion, Immortal, Restore, Speed, victory and defeat. The `machine-fire` entry selects one tick from the same burst so game fire cadence remains authoritative.

The server serves only explicitly allowed MP3 paths, with immutable caching. If the encoded pack changes, create a new asset filename and update the clip manifest and server allowlist together to avoid old cached audio using new offsets.

## Approved battle music (v1)

These are the exact original stereo 44.1 kHz / 192 kbps MP3 audition recordings approved by the user, with no third-party samples:

| File | Audition | Use | Duration |
| --- | --- | --- | --- |
| `music-iron-advance-v1.mp3` | A — Iron Advance | Random battle selection | 27.91 s |
| `music-overdrive-v1.mp3` | B — Overdrive | Splash, waiting room, countdown | 24.02 s |
| `music-steel-pressure-v1.mp3` | C — Steel Pressure | Random battle selection | 29.89 s |

The compositions layer synthesized percussion, bass, strings/brass-like tones and filtered textures. They retain their approved soft endings and repeat as complete recordings, rather than seamless musical loops. Their measured audition loudness is about -17 LUFS; `music.js` additionally applies a quiet 0.10 music gain under gameplay effects. Total encoded size: 1,968,718 bytes.

`music.js` chooses A/C independently on each client once per room/map round, retaining the choice across mute and visibility changes. Only tracks actually played are fetched and decoded. Replace filenames and update both the manifest and server allowlist when changing recordings; immutable cache URLs must not be reused for different bytes.
