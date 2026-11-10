# team-8
Vibe Jam 2026 – lag 8

## Museum Aurora
`index.html` – spelet. Ett becksvart museum i tredjeperson: tänd ficklampan med **F**, hitta sju guldstjärnor, öppna valvet, besegra Valvgorillan Bruno och ta kronan. Akta dig för nunnorna, och tryck inte på knappen i Naturhistoria. Fungerar även när filen öppnas direkt från disk.

- Sju salar: Entréhallen, Konstgalleriet, Moderna salen, Naturhistoria, Mineralrummet, Egyptiska salen och Flyghallen (`rooms/flyghallen-skrack.js`, flygplanen i `rooms/flygplan.js`). Provtändningsknappen i Flyghallen skjuter ut en dold stjärna.
- Lagets fyra fotoporträtt och fotoansiktet på vakten finns med (`assets/team-photos.js`).

### Slutbossen: Valvgorillan Bruno
När alla stjärnor är hittade och vakten kliver in i Skattkammaren hoppar en gorilla ner från taket.
Fighten är ett quick time event: en vit ring krymper mot en tangent (W, A, S eller D), och man ska trycka
exakt när ringen når den. Åtta träffar slår Bruno knockout och vinner spelet; tre missar (fel tangent,
för tidigt eller för sent) och vakten blir nedslagen och får gå en ny rond. Koden finns i `rooms/boss.js`;
kopplingen är några rader markerade med "Slutbossen" i `game.js`.
