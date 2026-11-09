# team-8
Vibe Jam 2026 – lag 8

## Museum Aurora (skräckversionen)
`index.html` – startsidan. Ett becksvart museum i tredjeperson: tänd ficklampan med **F**, hitta sex guldstjärnor, öppna valvet och ta kronan. Akta dig för nunnorna, och tryck inte på knappen i Naturhistoria. Fungerar även när filen öppnas direkt från disk.

## Museum Aurora 3D (lagets version)
`museum-team.html` – öppna via en webbserver (t.ex. `python3 -m http.server`) och samla alla sju guldstjärnor för att öppna valvet.

### Slutbossen: Valvgorillan Bruno
När alla stjärnor är hittade och vakten kliver in i Skattkammaren hoppar en gorilla ner från taket.
Fighten är ett quick time event: en vit ring krymper mot en tangent (W, A, S eller D), och man ska trycka
exakt när ringen når den. Åtta träffar slår Bruno knockout och vinner spelet; tre missar (fel tangent,
för tidigt eller för sent) och vakten blir nedslagen och får gå en ny rond. Koden finns i `rooms/boss.js`;
kopplingen till spelet är några rader i `museum-team.js` markerade med "Slutbossen".
