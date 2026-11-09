# team-8
Vibe Jam 2026 – lag 8

## Museum Aurora 3D
Öppna `index.html` via en webbserver (t.ex. `python3 -m http.server`) och samla alla sju guldstjärnor för att öppna valvet.

### Flyghallen (Sal 7)
Flyghallen ligger öster om Egyptiska salen och visar tre flygplansmodeller. Knappen för **provtändning**
i nordöstra hörnet tänder motorerna, och den hängande jetens efterbrännkammare skjuter ut en guldstjärna.
Koden finns i `rooms/flyghallen.js` (salen) och `rooms/flygplan.js` (modellerna); kopplingen till spelet är
några rader i `game.js` markerade med "Flyghallen".
