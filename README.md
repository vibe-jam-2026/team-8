# team-8 — SAAB-museet
Vibe Jam 2026 – lag 8

Ett 3D-spel i webbläsaren: gå runt i första person i ett museum med svenska stridsflygplan
(J 35 Draken, AJ 37 Viggen och JAS 39 Gripen). Allt renderas på grafikkortet med WebGL via
[Three.js](https://threejs.org) — skuggor, ACES-tonmappning, reflektioner och bloom.

Och ja: det finns en röd knapp. Tryck inte på den.

## Kör lokalt
ES-moduler kräver en webbserver (inte `file://`):

```sh
python3 -m http.server 8000
# öppna http://localhost:8000
```

## Styrning
| Tangent | |
|---|---|
| W A S D / pilar | gå |
| Mus | titta |
| Shift | spring |
| E / klick | interagera |
| Esc | paus |

## Filer
- `index.html` — sidan, HUD, startskärm och kraschskärm
- `src/main.js` — renderare, efterbehandling, styrning, spelloop
- `src/museum.js` — hallen, ljus, utställningar, knappen
- `src/aircraft.js` — procedurella flygplansmodeller
- `src/textures.js` — texturer ritade på canvas (golv, skyltar, kamouflage)
- `src/crash.js` — vad som händer när någon trycker på knappen
- `lib/` — Three.js r170 (MIT, se `lib/THREE-LICENSE`), lokalt så att sidan fungerar som statiska filer

Instruktionerna för övningen finns kvar i `instructions.html`.

## Testläge
`?view=x,y,z,lx,ly,lz` placerar kameran utan att låsa musen, och `&crash=sekunder` spolar fram kraschen —
praktiskt för skärmdumpar.
