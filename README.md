# Hullsong

[Play Hullsong](https://bx0-val.github.io/hullsong/) · [GitHub](https://github.com/bx0-val/hullsong)

A procedural, headphones-first drift through a dead fleet. Every "planet" is
a derelict ship. Most are sterile. A rare few stayed warm and damp long enough
to become worlds: seas pooled between hull plates, weather, small lights on the
night side, and something calling in the dark.

Everything runs in the browser (Three.js + Web Audio). The server only serves
static files.

## Run locally

Requires Python 3. No package installation or build step is needed.

```sh
git clone https://github.com/bx0-val/hullsong.git
cd hullsong
python3 -m http.server 8000 --directory web --bind 127.0.0.1
# open http://localhost:8000 with headphones
```

Use a desktop browser with WebGL, a keyboard and a mouse. Click **begin** to
enable audio. Three.js 0.160.0 loads from jsDelivr and fonts load from Google
Fonts, so an internet connection is required. Serve the files over HTTP rather
than opening `index.html` directly.

`?seed=anything` reproduces a universe. The music is never the same twice.

## Playing

Hulls carry **echoes**: small lights near their structure. Fly close, slow
down, and **hold Space**. Your binaural beat glides toward the echo's frequency.
When the beats match, the echo's hum settles and its memory decodes.

Each echo gives you:
- **a memory**, generated from the ship's crew, cargo and history. Every
  second echo also adds a line of the fleet record (the universe's mystery).
- **a phrase** built from that hull's resonances, which joins the music and
  keeps coming back, varied.
- sometimes **a bearing** to another hull. Living hulls are hidden until a clue
  or your ears lead you there.

The heart of a living hull resolves the mystery and plays back what you've gathered.

Fly down through a living world's clouds to skim its seas, and press **L** to
land on a hull plate or settle on the water. Landed, the mouse looks around.
On dead hulls, something inside sometimes knocks.

Nothing else out here can be reached: leviathans circling under the seas
(they dive if you come close), shoals that scatter, pale drifters in the void
that keep their distance and vanish if chased, lights carried along dead
hulls that go out as you approach, and sometimes something in the sky so large
you see it only as the stars going out.

mouse steer · W thrust · S brake · Shift boost · Q/E roll · Space attune · L land
J journal · F listen · B binaural level · M mute · H hide HUD · N new universe

## What varies per universe

- layout: an orbit around a local star, a frozen procession, a graveyard of
  small hulls, a wide scatter, or a colossal wreck with satellites
- star type, nebula, fog; the culture's phonology (all names); the fleet's fate
- ship architecture: hull, spindle, cathedral, seed, ring, shattered
- life type: ocean, amber, ice, murk
- tuning (modes, pentatonics, harmonic series, quartal), tempo or none,
  instrument palette and every instrument's timbre, binaural carrier range

## Code

The deployable site lives entirely in `web/`; paths below are relative to it.

| file | role |
| --- | --- |
| `js/universe.js` | layout, ships, telemetry, echoes, clues |
| `js/ships.js` | ship geometry per family, hull shader, biospheres, true-shape collision, echo nodes |
| `js/artifacts.js` | set pieces: sleeper fields, tethers, scaffolds, sails, slabs, crystals, orreries, lanterns, aurora |
| `js/entities.js` | leviathans, shoals, drifters, the thing in the sky, watchers |
| `js/text.js` | phonology, fleet fates, echo grammar |
| `js/music.js` | music profile + composer (movements, voice-leading, motifs, gifts) |
| `js/instruments.js` | synth voices |
| `js/audio.js` | engine: binaural, buses, hull voices, creatures, echo voices |
| `js/hud.js`, `js/main.js` | interface, flight, attunement |

`window.hullsong` exposes the universe, ships, audio engine and `decode()` for
debugging in the console. `hullsong.audio.levels()` prints per-bus RMS.

## Development

Edit `web/index.html`, `web/style.css`, or the modules in `web/js/`, then reload
the local server. All asset and module URLs are relative, so the game also works
under the `/hullsong/` GitHub Pages path.

With Node.js 24 installed, check JavaScript syntax before committing:

```sh
bash scripts/check.sh
```

For a browser smoke test, open `http://localhost:8000/?seed=hullsong`, click
**begin**, check flight with **W/S**, open and close the journal with **J**,
toggle mute with **M**, and check the browser console for errors. **N** should
load a new universe while preserving the current site path.

## Publishing

[GitHub Actions](https://github.com/bx0-val/hullsong/actions/workflows/pages.yml)
checks JavaScript on pushes to `main` and pull requests. Successful pushes to
`main` automatically publish only `web/` to GitHub Pages. The workflow can also
be run manually from the Actions tab.

The repository's **Settings → Pages → Build and deployment → Source** must be
set to **GitHub Actions**. No deployment keys, build output, or third-party
hosting service are needed.
