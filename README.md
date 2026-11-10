# team-8
Vibe Jam 2026 – lag 8

## Museum Aurora
`index.html` – spelet. Ett becksvart museum i tredjeperson: tänd ficklampan med **F**, hitta sju guldstjärnor, öppna valvet, besegra Valvgorillan Bruno och ta kronan. Akta dig för nunnorna, och tryck inte på knappen i Naturhistoria. Fungerar även när filen öppnas direkt från disk.

- Sju salar: Entréhallen, Konstgalleriet, Moderna salen, Naturhistoria, Mineralrummet, Egyptiska salen och Flyghallen (`rooms/flyghallen-skrack.js`, flygplanen i `rooms/flygplan.js`). Provtändningsknappen i Flyghallen skjuter ut en dold stjärna.
- Lagets fyra fotoporträtt och fotoansiktet på vakten finns med (`assets/team-photos.js`). De läskiga porträtten på väggarna växlar mellan fem personer: originalfotot och lagets fyra foton.
- Skyltarna visas i en halvgenomskinlig ruta till höger och stängs själva efter 4 sekunder.
- Påskägg: skrik högt i mikrofonen så flyger vaktens hatt av. Den kommer tillbaka efter några sekunder. Spelet ber om mikrofonen när ronden börjar; säger man nej fungerar allt annat som vanligt.

### Slutbossen: Valvgorillan Bruno
När alla stjärnor är hittade och vakten kliver in i Skattkammaren hoppar en gorilla ner från taket.
Fighten är ett quick time event: en vit ring krymper mot en tangent (W, A, S eller D), och man ska trycka
exakt när ringen når den. Åtta träffar slår Bruno knockout; tre missar (fel tangent, för tidigt eller för sent)
och vakten blir nedslagen och får gå en ny rond.

**FINAL FIGHT:** Bruno reser sig och ställer fyra frågor om Haga slott utanför Enköping (svara med 1–4 eller
klicka). Rätt svar och vakten slår, fel svar och Bruno slår och frågar igen. Den sista frågan är när slottet
byggdes. Klarar man alla fyra går Bruno i golvet för gott, kameran vänder sig mot vakten som står i en cool
pose med tummen upp, och spelet är vunnet. Koden finns i `rooms/boss.js` (frågorna i `QUIZ` överst);
kopplingen är några rader markerade med "Slutbossen" i `game.js`.
