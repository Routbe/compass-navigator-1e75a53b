# Studio opschonen: Knopvorm, glas, onderdelen en bezoekeffect

## 1. Knoppen & Typografie
- **Eerst kijken:** ik vergelijk de oude versie (compass-navigator-46a89257) met hoe het nu is opgebouwd.
- **KNOPVORM staat bovenaan:** je kiest een stijl als één rij voorbeelden (Bordered, Solid Flat, Pill, Sharp, Glass, Neon Glow, plus stijlen met en zonder glas). Rechts staat een rond aanpasknopje, net als bij Typografie.
- **Als aanpassen aan staat:** de vaste stijlen verdwijnen en je krijgt alle opties. Dat zijn hoekafronding, knopkleur, tekstkleur, rand en schaduw. Ook glas kan je daar aan of uit zetten. Staat glas aan, dan kies je het soort glas, de transparantie, de vervaging en de rand.
- **Verdwijnt:** de schakelaar "Eigen knopstijl", het losse blok "Glaseffect" en "Glaseffect toepassen op". Waarop iets van toepassing is, kies je alleen nog bovenaan.
- **Keuzelijst "toepassen op":**
  - "Anonieme vragen" en "Q&A-antwoorden" worden samen één keuze: "Anonieme vragen".
  - Je ziet alleen onderdelen die echt op je profiel staan, zoals het anonieme vragenvenster, boekingen of het prikbord.
  - Op gsm staat de keuze mooi naast de titel, met korte namen zoals "Alles", "Links" en "Vragen".
- **Gelijke vormgeving:** alle keuzeknoppen in de Studio krijgen dezelfde rustige stijl. Zo lijken de knoppen in de Studio niet op de knoppen van je profiel.

## 2. Componenten (Inhoud)
- "Anonieme Inbox", "Prikbord" en "Badges & diploma's" krijgen dezelfde kader als de andere onderdelen.
- Elk krijgt een schakelaar om het meteen aan of uit te zetten. Met een pijltje klap je het open om het verder in te stellen.

## 3. Achtergrond & Visual FX
- Zet je aanpassen aan, dan worden de ROUT-presets echt verborgen.
- **"Pagina bezoek effect" komt los te staan:** het krijgt een eigen plek buiten aanpassen, met een eigen rond aanpasknopje.
- **Opties in dat bezoekeffect:**
  - Kies tot 4 eigen emoji's.
  - Stel de duur en de hoeveelheid in.
  - Stel het opbouwen en afbouwen in (zacht, snel of meteen).
  - Kies de richting: omlaag, omhoog, schuin of van het midden naar buiten.
  - Zet "vervagen naar beneden" aan of uit.
  - Staat vervagen uit, dan kies je wat er onderaan gebeurt: doorvallen, blijven liggen en verdwijnen, stuiteren of uiteenspatten.
- **Testen:** de testknop speelt jouw eigen versie af in het voorbeeld.

## Controle
- Bekijken op computer en gsm (360px).
- Tests voor de nieuwe instellingen van het bezoekeffect en voor het samenvoegen van de anonieme vragen.
- Typecheck.

## Technische details
- `ScopedThemeBar.tsx`: preset-modus en aanpasmodus, met `buttonsCustom` als vlag voor het aanpasknopje. Elke preset geeft een volledige set waarden, ook `glassStyle`. Het blok voor `glassTargets` gaat weg. Een glasstijl die niet `solid` is, geldt voor de gekozen scope. Bestaande `glassTargets` blijven gelezen worden voor oude data, zonder dat het formaat van wat al bewaard is verandert.
- `ThemeScopeSelect`: krijgt `allowedScopes` op basis van de gepubliceerde blokken. `qa` wordt een alias van de scope voor anonieme vragen. Korte labels komen onder `sm`. De kop wordt een grid (`grid-cols-[minmax(0,1fr)_auto]`).
- Er komt één gedeelde chip-variant voor de Studio-knoppen.
- `ProfileContentAccordion`: inbox, prikbord en badges gebruiken de bestaande rij-component met een schakelaar en uitklapknop.
- `DesignTabEditor`: presets alleen tonen als `!backgroundCustom`. `VisitEffectPicker` gaat ernaast staan.
- `visit-effects.ts` en `profile-display.ts`: nieuwe pref `visitEffectCustom` met de velden `emojis[≤4]`, `duration`, `amount`, `easeIn/out`, `direction`, `fade` en `floor: through|vanish|bounce|splat`. Alles wordt genormaliseerd en heeft een begrensde maximale waarde.
- AGENTS.md: de regel over ScopedThemeBar en glas wordt bijgewerkt.
