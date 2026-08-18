# Changelog

All notable changes to the KSC Wiedikon website. This file is the curated, user-facing release record (semver); the same notes appear on the site's feedback page (DE + EN). For commit-level detail see `git log`.

## [1.26.0] — 2026-08-18

### Volle und offene Teams richten sich wieder nach dem Schalter der Trainer:innen
- Auf der Nachwuchsseite stand bei **DU12** «Team voll» samt Warteliste, obwohl das Team **offen für neue Spielerinnen** war. Der Schalter, den die Trainer:innen umlegen, wurde von einem alten Link in der Vereinsdatenbank **überstimmt** — wer sich anmelden wollte, landete auf der Warteliste statt beim Team.
- Bei **MU8** verdeckte derselbe Link, dass das Team **Mädchen aufnimmt** und nur bei den Knaben voll ist. Die Karte zeigt jetzt wieder beide Hälften getrennt.
- Der Link war bei **allen** Teams dieselbe Warteliste — er sagte also nichts aus, überstimmte aber den Schalter. Neu entscheidet **einzig** «offen für neue Spieler:innen», ob eine Karte grün oder golden ist; die Warteliste ist für alle dieselbe und wird automatisch angehängt.
- Das Kontaktformular folgt derselben Regel: Bei einem **vollen Nachwuchsteam** führt es weiterhin zur Warteliste statt eine Anfrage an die Trainer:innen zu schicken. Aktiv- und Volleyballteams, die gerade niemanden suchen, bleiben wie bisher **direkt kontaktierbar**.
- Kleinigkeit am Rand: Der Warteliste-Knopf bei **HU14** blieb auf Englisch deutsch — er übersetzt jetzt mit.

## [1.25.0] — 2026-08-14

### Fehlende Unterlagen: die Formulare kommen jetzt ausgefüllt
- Wer die Aufforderung bekam, fehlende Unterlagen nachzureichen, landete auf einer Seite, die zwar **auflistete**, welche Dokumente fehlen, aber nirgends sagte, **woher man sie bekommt** — die leeren Formulare von Swiss Basketball und der FIBA sind nur im Anmeldeformular verlinkt, und dorthin geht niemand zurück, der sich längst angemeldet hat.
- Neu steht bei jedem fehlenden Dokument ein Knopf **«Vorausgefülltes Formular herunterladen»**. Name, Adresse, Geburtsdatum, Nationalität und Datum sind bereits eingetragen — es bleibt **ausdrucken, unterschreiben, hochladen**.
- Ausgefüllt wird **auf dem Server**, nicht im Browser: die Angaben verlassen den Verein damit nur als fertiges PDF, dessen Inhalt die Familie ohnehin selbst geliefert hat. Die Seite selbst erfährt weiterhin **nur, ob** ein Dokument vorliegt — keine Namen, keine Geburtsdaten.
- Bei den beiden Ausweisseiten gibt es bewusst keinen Knopf: das sind Fotos eines Dokuments, das der Verein nicht ausstellt.

### Das Formular zum Nachreichen war im dunklen Design unlesbar
- Auf der Seite zum Nachreichen von Unterlagen war das Feld für die Referenznummer **weisse Schrift auf weissem Grund** — praktisch unlesbar, und zwar in der Standarddarstellung, nicht in einer Randeinstellung. Die beiden Knöpfe waren gar nicht als Knöpfe zu erkennen.
- Betroffen war ausgerechnet die eine Seite, auf die der Verein Familien schickt, deren Unterlagen fehlen. Behoben — Feld und Knöpfe sehen jetzt aus wie überall sonst auf der Website, hell wie dunkel.

## [1.24.0] — 2026-08-13

### Die beiden U18-Mädchenteams nennen jetzt ihre eigenen Jahrgänge
- Auf der Nachwuchsseite standen bei **DU18 Spark** und **DU18 Fire** dieselben Jahrgänge, weil die Website sie aus der Alterskategorie **ausrechnet** (Swiss Basketball: U18 = 2009 + 2010 in der Saison 2026/27, erweitert auf 2009–2012, weil der Verein diese Saison kein U16-Mädchenteam führt). Spark spielt aber mit einem Jahrgang **2008**. Neu stehen für die beiden Teams die Jahrgänge, die der Verein selbst angibt: **Spark 2008–2012**, **Fire 2009–2012**.
- Diese von Hand eingetragenen Jahrgänge **rücken jeden 1. August automatisch um ein Jahr weiter**, genau wie die ausgerechneten daneben — sie veralten also nicht still zum Saisonwechsel.
- Die Geburtsdaten der Spielerinnen stehen dabei **nirgends** auf der Website und werden auch nicht dafür ausgelesen; es sind nur die Jahrgänge, die der Verein ohnehin öffentlich nennt.

### Ein Fehler beim Erstellen der Website versteckt nicht mehr die halbe Nachwuchsseite
- Am 13.08. beantwortete die Vereinsdatenbank die Anfragen einer Website-Erstellung mit «keine Berechtigung». Die Seite **/basketball/teams/nachwuchs** ging trotzdem online — mit zehn namenlosen Platzhalterkarten: **ohne Teamnamen** (statt DU18 Spark/Fire nur «U18 Mädchen»), **ohne Trainingszeiten**, **ohne Trainer:innen** und mit einer Karte für ein Team, das es gar nicht mehr gibt. Sichtbar war das eine Stunde lang, bis die nächste Erstellung wieder funktionierte.
- Der Grund: Eine Erstellung ohne Daten sah bisher aus wie eine erfolgreiche. Neu **bricht die Erstellung der Live-Website ab**, wenn diese Daten fehlen — dann bleibt die letzte funktionierende Fassung online, statt durch eine halb leere ersetzt zu werden. Vorschau-Erstellungen und die lokale Entwicklung verhalten sich unverändert.

## [1.23.0] — 2026-08-13

### Neu: eine Seite mit häufigen Fragen
- Die Website beantwortete nirgends die Fragen, die einen Interessierten tatsächlich aufhalten. Neu gibt es **/weiteres/faq** mit neun Antworten: Probetraining, Anmeldung, Beiträge, Gastspieler, Schreiberpflicht, Trainingszeiten sowie Volleyball und Basketball für Kinder.
- Die Seite ist im Fussmenü verlinkt, von der Mitgliedschaftsseite aus erreichbar und über die Suche auffindbar. Für Google und KI-Antwortdienste ist sie zusätzlich als **FAQ ausgezeichnet**.
- **Bewusst noch nicht beantwortet**, weil nur der Vorstand es entscheiden kann: ob Anfänger:innen ohne Vereinserfahrung aufgenommen werden, in welcher Sprache trainiert wird, ob ein Einstieg mitten in der Saison möglich ist und welche Kündigungsfrist gilt. Sobald das geklärt ist, kommen die Antworten dazu.
- Die Beiträge stehen **absichtlich nicht** auf der FAQ-Seite, sondern nur auf der Mitgliedschaftsseite — doppelt gepflegte Zahlen laufen früher oder später auseinander.

## [1.22.0] — 2026-08-13

### Die Suche findet endlich die Teams
- Die Suchfunktion oben rechts kannte **keine einzige Teamseite**. Wer «D1», «Lions», «Rhinos» oder «HU20» eingab — also die eigenen Teamnamen des Vereins — bekam **kein Ergebnis**. Jetzt sind alle 19 Teamseiten dabei, und die Liste baut sich beim Erstellen der Website automatisch aus Directus auf, statt von Hand gepflegt zu werden. Neue Teams sind damit ab sofort automatisch auffindbar.
- Ausserdem findet die Suche jetzt auch Begriffe, die zwar niemand auf der Seite geschrieben hat, aber alle eingeben: **«Probetraining»**, **«Kosten»**, **«Beitrag»**, **«Kinder»**, **«anmelden»** führen jetzt zur jeweils richtigen Seite. Vorher: null Treffer.

## [1.21.1] — 2026-08-13

### Drei Teams waren auf der Website unsichtbar
- **DU20** (Volleyball, Mädchen U20) sowie **H-Classics** und **D-Classics** (Basketball) sind in Directus aktiv, tauchten aber **nirgends** auf der Website auf — nicht im Menü, nicht auf den Sportseiten, ohne eigene Teamseite. Sie fehlten in einer Zuordnungstabelle im Code, und wer dort fehlt, wird beim Bauen der Seite **kommentarlos weggelassen**. Jetzt sind alle drei da, inklusive Teamseite.
- Damit das nicht wieder unbemerkt passiert: Ein neu in Directus angelegtes Team, das noch keine Zuordnung hat, erzeugt jetzt eine **Warnung im Bauprotokoll** statt still zu verschwinden.

### Basketball-Menü stimmt wieder mit den Teamseiten überein
- Drei von fünf Einträgen im Basketball-Menü nannten **andere Teams als die Seiten, auf die sie führten** — «Herren 3» führte zu «Herren 2», «Herren 4» zu «Unicorns Herren 3», und Rhinos war als «2. Liga» angeschrieben statt als 3. Liga. Das Menü holt die Namen jetzt direkt aus Directus, wie das Volleyball-Menü schon lange.

### Datenschutz
- Der Auftragsbearbeitungsvertrag mit **Cloudflare** ist jetzt genannt — er ist Bestandteil der Nutzungsbedingungen, was im Cloudflare-Konto bestätigt ist.

## [1.21.0] — 2026-08-13

### Falsche Adressen zeigen nicht mehr einfach die Startseite
- Wer sich vertippt hat oder einem alten Link folgte, landete **wortlos auf der Startseite** — die Seite meldete dem Browser sogar «alles in Ordnung». Das betraf auch echte, früher existierende Seiten: Teamseiten wechseln bei jedem Saisonwechsel im Juni, und jeder Link auf ein altes Team führte still auf die Startseite. Neu gibt es eine richtige **«Seite nicht gefunden»-Seite** mit Wegweisern zu Volleyball, Basketball, Startseite und Kontakt.

### Das Vereinswappen ist wieder das Vereinswappen
- Das kleine Symbol im Browser-Tab (**Favicon**) war seit dem allerersten Tag das **Logo des verwendeten Programmier-Werkzeugs**, nicht das KSCW-Wappen — überall dort sichtbar, wo Lesezeichen, News-Reader oder Link-Vorschauen es abholen. Jetzt kommt das Wappen, zusätzlich als **App-Symbol** für «Zum Startbildschirm hinzufügen» auf dem iPhone.
- Wer einen Link zu kscw.ch in **WhatsApp, Instagram oder Facebook** teilt, bekam bisher eine **graue Kachel ohne Bild**. Neu erscheint das Vereinswappen als Vorschaubild.

### Die Datenschutzerklärung stimmt wieder
- Impressum und Datenschutz nannten **Hetzner** als Hoster der Website. Die Website läuft seit dem Umzug auf **Cloudflare** — eine Auskunftsanfrage wäre also an eine Firma gegangen, die gar nichts über einen weiss. Das ist korrigiert; Hetzner bleibt, richtig benannt als Standort der Vereinsdatenbank.
- Neu beschrieben sind der **Spam-Schutz der Formulare**, der **Newsletter** und die **Vereinsanmeldung** — letztere sammelt AHV-Nummer, Zahlungsverbindung und teils ein Ausweisdokument, und stand bisher in der Datenschutzerklärung überhaupt nicht.
- Der Cookie-Abschnitt beschrieb Cookies, die es gar nicht gibt. Die Website setzt **keine Cookies** und verwendet **keine Statistik-Werkzeuge**; gespeichert werden nur Farbschema, Sprache und Kaderansicht, direkt im Browser. Deshalb braucht diese Website **kein Cookie-Banner** — das steht jetzt auch so da. Die Erklärung trägt neu ein **Datum**.
- **Instagram-Feeds** auf Teamseiten wurden bisher sofort geladen, obwohl die Datenschutzerklärung ausdrücklich das Gegenteil versprach. Jetzt erscheint zuerst ein Hinweis mit Knopf — geladen wird erst nach Zustimmung.

### Teamseiten sagen endlich, wann und wo trainiert wird
- **Trainingszeiten, Wochentag und Halle** stehen jetzt direkt in der Seite, statt erst nach dem Laden zu erscheinen. Die Daten waren immer schon da — sie wurden nur weggeworfen. Das ist die meistgestellte Frage auf der ganzen Website, für Mitglieder wie für Gegner.
- Bei Google hiessen alle 16 Teamseiten bisher nur «**D1 — KSC Wiedikon**» und hatten **keinen Beschreibungstext**. Jetzt stehen dort der volle Teamname, die Sportart und die Liga.
- Basketball-Ligen erschienen als **Verbandskürzel** («H3LS», «D1LRA»). Jetzt steht dort «3. Liga» bzw. «1. Liga».

### Mitgliedschaft: keine widersprüchlichen Angaben mehr
- Auf der Mitgliedschaftsseite stand, man bekomme das **Anmeldeformular auf Papier** vom Trainer — zwanzig Zeilen über vier Knöpfen, die zum funktionierenden Online-Formular führen. Der Text beschreibt jetzt den tatsächlichen Weg.
- Der **Zuschlag von CHF 100** ohne erfüllte Offiziellen-Pflicht im Basketball war zwar formuliert und übersetzt, wurde aber **auf keiner Seite angezeigt**. Wer mit CHF 520 rechnete, konnte CHF 620 verrechnet bekommen. Er steht jetzt bei den Beiträgen.

### Kleinere Dinge, die grösser waren als sie klingen
- Nach einem **Fehler beim Absenden** des Kontakt- oder Feedback-Formulars war jeder weitere Versuch zum Scheitern verurteilt — der Spam-Schutz gibt seinen Prüfcode nur einmal aus. Jetzt funktioniert der zweite Versuch.
- Das **Kontaktformular ragte auf dem Handy rechts aus dem Bild** — also genau dort, wo Interessierte den ersten Schritt machen sollen.
- Rückmeldungen der Formulare werden neu auch von **Screenreadern vorgelesen**.
- Beim **Ausdrucken** war die Seite praktisch leer: weisse Schrift auf weissem Papier. Wer Hallenadressen fürs Anschlagbrett druckt, bekommt jetzt ein lesbares Blatt.
- Im dunklen Design waren **Spielzeiten, News-Daten und Tabellenköpfe** zu blass. Zwei Rückennummern (Libero) waren im hellen Design **weiss auf weiss**, also gar nicht zu sehen.
- Die Startseite hat neu einen **Knopf für ein Probetraining** — vorher führte von dort kein einziger Weg zum Mitmachen. Der Untertitel nennt jetzt **Zürich-Wiedikon**.
- Die Teamzahl wurde an drei Stellen **unterschiedlich** angegeben (300 Mitglieder / 20 Teams / 30 Teams). Jetzt einheitlich.
- Neu gibt es eine **sitemap.xml** für Suchmaschinen.

## [1.20.0] — 2026-08-12

### Die Seite lädt nicht mehr zuerst auf Deutsch und springt dann auf Englisch
- Wer die Website auf **Englisch** liest, bekam zuerst die **fertige deutsche Seite** zu sehen und erst danach die Übersetzung. Nicht den Bruchteil einer Sekunde, wie es auf einer schnellen Leitung aussieht: gemessen **1,7 bis 2,7 Sekunden** bei normaler Mobilverbindung. Auf der Startseite ist die deutsche Fassung jetzt **in keinem einzigen Bild** mehr zu sehen, auf den übrigen Seiten bleiben rund 0,25 Sekunden.
- Der Grund war die Reihenfolge, nicht die Geschwindigkeit: die Übersetzungsdatei wurde erst angefordert, wenn die **ganze Seite** fertig geladen war — inklusive einer 398 KB grossen Icon-Datei. Sie wird jetzt als Erstes angefordert, noch bevor irgendetwas anderes lädt.
- Drei Texte waren **dauerhaft** falsch, nicht nur kurz: auf **Feedback** stand «WAS IST NEU» über dem englischen Änderungsprotokoll, und die **Spieltabellen** auf der Startseite blieben in jeder Sprache deutsch («Laden…», «Keine Spiele gefunden.»).
- «**Keine News vorhanden.**» stand auf der Startseite und auf **News**, solange die News noch geladen wurden — also eine Aussage, die in dem Moment niemand kennen konnte. Sie erscheint jetzt nur, wenn es wirklich keine gibt.

### Teamseiten sind sofort da, statt zu springen
- Die Teamseiten (z. B. **Damen 1**, **HU20**) waren im ersten Moment **leer** und füllten sich erst, wenn die Daten eintrafen — der Titel, die Liga und das Mannschaftsfoto sprangen dabei unter der Leserin weg. Das war der mit Abstand grösste Sprung auf der ganzen Website. Titel, Liga, Saison, Jahrgänge und Foto sind jetzt **von Anfang an da**, auch ohne JavaScript.
- Der **Sprachumschalter** hat auf Teamseiten bisher die halbe Seite geleert und alles neu geladen — Foto inklusive. Jetzt werden nur die Bezeichnungen ausgetauscht.
- **Spielplan, Kader, Rangliste und Kurse** werden jetzt **gleichzeitig** mit den Übersetzungen geladen statt danach. Beim Kalender waren es sogar drei Ladevorgänge hintereinander.

### Schrift und Icons kommen nicht mehr von Google
- Die Schrift **Inter** wird jetzt vom eigenen Server geliefert statt über zwei Umwege zu Google. Damit verschwindet das Umbrechen des Textes, das bisher bei jedem ersten Besuch auftrat — das war der einzige dieser Sprünge, den auch deutschsprachige Besucher gesehen haben.

## [1.19.0] — 2026-08-12

### Jedes Nachwuchsteam sagt jetzt, welche Jahrgänge mitspielen können
- Auf jeder Nachwuchs-Karte steht neu die **Jahrgangs-Zeile** — Basketball U18 «Jahrgänge: 2009, 2010» bis U8 «Jahrgänge: 2019, 2020». Die Frage, die Eltern zuerst stellen, stand bisher nirgends auf der Website.
- Die Zeile **rechnet sich selber weiter**: am **1. August** verschiebt sich jede Kategorie um ein Jahr, und zwar auch dann, wenn die Website in dem Moment gar nicht neu gebaut wird. Sie muss also nie jemand nachtragen.
- Bei den **U18-Mädchen steht 2009–2012**, weil es diese Saison kein U16-Mädchenteam gibt und die beiden U18-Teams diese Jahrgänge mittragen. Das ist keine Eigenheit von U18, sondern eine des aktuellen Kaders — die Zeile liest den Kader aus Directus, und sobald es wieder ein U16-Mädchenteam gibt, wird sie von selbst wieder schmaler.
- **Volleyball rechnet eine Jahrgangsgrenze anders als Basketball**: Swiss Volley zählt vom zweiten Kalenderjahr der Saison, Swiss Basketball vom ersten, weshalb dieselbe U-Zahl in den beiden Sportarten ein Jahr auseinanderliegt. Swiss Volley setzt zudem **keine untere Grenze** — ein U20-Team spielt tatsächlich mit 15-Jährigen. Darum steht dort «Jahrgang: 2008 und jünger» statt zwei Jahrgängen.
- Zu sehen auf **Basketball → Nachwuchs**, bei den Nachwuchs-Karten auf der **Volleyball**-Seite und auf den Teamseiten von **DU23, HU23 und HU20**. Auf Deutsch und Englisch.

## [1.18.0] — 2026-08-11

### Texte auf der Website lassen sich jetzt selber ändern
- Im Website-Admin gibt es neu den Bereich **Seitentexte**: Seite auswählen, den Text auf Deutsch und Englisch anpassen, speichern. Die Änderung ist **nach wenigen Sekunden live** — ohne Umweg über den Code und ohne auf einen Neuaufbau der Seite zu warten.
- Der **Originaltext bleibt immer erhalten**. «Original» holt die ursprüngliche Formulierung zurück, auch Monate später — eine Änderung im Browser kann die ausgelieferte Fassung nicht überschreiben.
- Es stehen **alle Texte der Website** zur Auswahl, nach Seite geordnet und in der Reihenfolge, in der sie auf der Seite vorkommen. Wer den Text kennt, aber nicht die Seite, findet ihn über die Suche. Header, Footer und die Meldungen der Formulare stehen als eigene Gruppen.
- Was hier **nicht** geht: ein Link oder Fettschrift mitten im Satz. Texte werden bewusst als reiner Text eingesetzt — das ist der Grund, warum ein editierbarer Text keine Sicherheitslücke aufreissen kann.

### «Die meisten Heimspiele» stimmte nicht
- Auf der Spielplanungs-Seite stand, an Spielsamstagen fänden **die meisten Heimspiele** statt. Das trifft nicht zu — und die Aussage stand an **drei Stellen**: im Einleitungstext, im Abschnitt «Spielsamstage» und bei der Halle Kantonsschule Wiedikon.
- Alle drei beschreiben Spielsamstage jetzt ohne Mengenangabe, auf Deutsch und Englisch.

## [1.17.0] — 2026-08-08

### The girls' youth cards had gone blank
- The **U18 and U16 Mädchen cards showed no training, no coach and no status** at all. The club had renamed the two girls' squads in Directus — to **DU18 Spark** and **DU18 Fire** — and the page matched teams against a fixed list of names, so after the rename nothing matched and both cards emptied themselves. It was the third rename these teams have been through, and it emptied them every time.
- The page no longer holds a list of teams at all: it **renders one card per team Directus actually has**, working out the age group from the team's own name. A squad added shows up, a squad dropped disappears, and a rename carries through — without the page being edited.
- So **U18 now has both girls' squads** side by side, each under its own name, and **U16 has no girls' card**, because this season the club has no U16 girls' team — DU18 Fire is a U18 team that plays down in the U16 league. The team grid on the Basketball page follows the same two names.
- Where a team's name in Directus is just its age code, the German label stays: "U8 Mixed" reads better than "MU8".

### Mixed teams can take girls and boys separately
- U8 and U10 are mixed, but the squad fills up per gender, so "open for players" was too blunt: it either invited everyone or nobody. Coaches can now open the team **for girls and boys independently** from the team settings in Wiedisync.
- With only one of the two open, the card **splits**: the gender being taken gets the green badge and the contact form, the other gets the gold "Team voll" badge and the waiting list. Opening both — or neither, which is where every team starts — shows the single "open for players" row exactly as before.
- The waiting-list button is now **gold instead of blue**, matching the "Team voll" chip next to it.

### The Nachwuchs descriptions are gone
- The paragraph under each youth team ("Unser U18-Knabenteam spielt in der regionalen Jugendliga …") has been removed from all ten cards. The training times, coach and joining status stay — those come from Directus and are the part that is actually current.

## [1.16.4] — 2026-07-30

### The membership fee tables were cut off on the right
- The three tables on **Membership** sat three across on a desktop, which left each column too narrow for its own content. The category descriptions could not wrap, so the tables overflowed their columns: the **fee amounts were pushed out of sight** behind a scrollbar, on the very page whose job is to state them.
- **Volleyball and basketball now sit side by side**, with the Swiss Volley licence fees below volleyball, where they belong. Two full-width columns fit their text, so nothing is clipped. On a phone the three still stack in that order.
- The **Category / Fee** headings were dark grey on the dark blue header bar and effectively invisible. They are white now.

## [1.16.3] — 2026-07-25

### One member, one spelling — the accent tables had drifted apart
- Accented names are rewritten in three places: the licence PDFs from the sign-up form, the licence PDFs from the admin, and the ClubDesk export. Each had grown **its own table** of which letters to fold, and they disagreed — a Turkish member came out **`Isik` on the licence form and `Is?k` in the member register**, from a single registration. Letters affected: `ı` (Turkish dotless i), `ħ`, `ŧ`.
- All of them now share one table, and the ClubDesk sync on the server side was given the same set, so nothing lands in the register as a `?` any more. Names CP1252 can carry are untouched as always (**ä ö ü é à ç ß Š ž Ø Æ**).
- Tests pin the tables against each other in both repos: change one without the others and the build fails, rather than a member quietly acquiring a second spelling.

## [1.16.2] — 2026-07-25

### The ClubDesk export was mangling every accented name
- The file was written as **UTF-8**, but ClubDesk's CSV interface is **Windows-1252** — its own export is CP1252 and the scripted member sync transcodes before uploading. Importing our UTF-8 file by hand turned `Dürig` into `DÃ¼rig` in the member register, and the leading byte-order mark left the first column header reading `ï»¿Nachname`, which may not map at all.
- The export is now CP1252 with no BOM, using the same transliteration the scripted sync uses: letters CP1252 holds are written as-is (**ä ö ü é à ç ß Š ž**), and the few it cannot lose their diacritic (**ć → c**, **ł → l**, **đ → d**) rather than arriving as mojibake. Both writers now put the same spelling into the register.

### The "none" option in Federation of origin now names the federation
- It read *"None / never licensed before"*, which is ambiguous for someone who **was** licensed — just not with a national federation. Italy's **CSI**, **UISP** and **PGS** are CONI sports-promotion bodies, not FIVB/FIBA members, so no licence exists to transfer.
- Such an applicant would reasonably have picked **Italy**, which would send the club chasing **FIPAV** for a clearance FIPAV has no record to issue. The option now reads *"None / never licensed with a national federation"*, so the right answer is obvious.

## [1.16.1] — 2026-07-25

### The federation picker names the actual federation, per sport
- "Federation of origin" asks which **body** first licensed you, and that answer is sport-specific: an Italian volleyballer came from FIPAV, an Italian basketballer from FIP. The picker now shows the federation's own name next to the country instead of the country alone. The list is deliberately not exhaustive — anything not covered falls back to the country name, which is still a correct answer, just less specific.
- Switching between volleyball and basketball **clears a federation already picked**, rather than leaving a label from the other sport attached to the stored code.

## [1.16.0] — 2026-07-25

### Dual nationals can enter every passport they hold
- Nationality was a single choice, which forced anyone with two passports to pick one and discard the other — and the discarded one is often the one that decides which documents Swiss Basketball and FIBA want. It is now a **multi-select with chips**: pick all of them, and the first choice counts as the primary.
- **A Swiss passport anywhere in the list makes the applicant Swiss** for the document rules, not just when it happens to be listed first. FIBA treats a dual national holding Swiss nationality as Swiss, so a CH/IT player who listed Italy first was being asked for foreign-player documents nobody required of them. The form and the server apply the same rule, deliberately — a form that asks for less than the server enforces rejects the submission after everything has already been uploaded.
- The licence application ticks **Schweiz** for anyone holding a Swiss passport, whichever position it sits in: the form asks whether the player is Swiss, not which passport comes first.

### Federation of origin
- New field for the **first** national federation the player held a licence with — the one Swiss Basketball needs in order to request a transfer certificate. Not the most recent one, which is a different question with a different answer for anyone who has moved more than once.
- **"None" is an explicit answer, not a blank.** It says this is a first licence and there is nothing to request, which is exactly what the club needs to know; an empty field only says nobody filled it in.

## [1.15.4] — 2026-07-25

### The Freibrief waiver is back, this time on both sides
- The server now implements the same rule (wiedisync migration 232 + `bbFreibriefWaived`), so the form can stop asking for the release letter where Swiss Basketball does not require it: **no licence in the last two seasons**, or **category U12 and below**. Live on dev and prod before this was switched on — the ordering is the whole point, since 1.15.1 shipped the form half alone and locked those applicants out.
- U12 and below is derived from the date of birth and never asks anything extra. Everyone else transferring from a Swiss club is asked once whether they held a licence in the last two seasons; only an explicit **no** waives the document. Unanswered still requires it, on the form and on the server alike — waiving wrongly produces an incomplete dossier that Swiss Basketball rejects later, so the cautious answer is the default.
- The answer is stored with the registration, so the "documents still missing" page and the approval step in the admin agree with what the form asked for, instead of re-demanding a document nobody owes.

## [1.15.3] — 2026-07-25

### Correction: the Freibrief waiver from 1.15.1 is switched off again
- 1.15.1 stopped asking for the Freibrief where Swiss Basketball waives it — no licence in the last two seasons, or category U12 and below. **That was only half the change.** The server checks the same list independently and still requires the release letter for every transfer from a Swiss club, so a submission without one is rejected outright with "Erforderliche Dokumente fehlen. Bitte lade die Seite neu und versuche es erneut." — advice that cannot help, because reloading changes nothing.
- The effect was the opposite of the intent: applicants who were merely being asked for a document they did not owe **could not register at all**. It applied exactly to the group the change was meant to help, which for a youth club is a common case.
- The form asks for the Freibrief from every Swiss-club transfer again, as it did before 1.15.1, and the licence-history question is hidden. The rule itself is still correct and stays in the code — it switches back on together with the matching server-side change, not before.

## [1.15.2] — 2026-07-25

### An ID download could delete the original without ever saving it
- Downloading an applicant's ID **deletes it from the server afterwards** — we keep the scan no longer than we need it, which also makes the delete irreversible. It ran per file with no check that the download had actually worked: on an expired token or a 401 it saved **the error message** under the applicant's name and deleted the real scan a line later. Every byte is now fetched and verified before anything is removed.
- The saved file also had **no extension**, so even a successful download would not open on a double-click. It now follows the file's actual type.

### The remaining downloads no longer truncate
- The previous release fixed the licence forms; the same fault was in **four other download paths**, including **individual scoresheets** and the **SVRZ bundle** — the largest file the admin produces, and the one where a truncated download is least likely to be noticed before it is sent on. All downloads now go through one helper that holds the file until the browser has written it.

### Photographed documents are no longer saved sideways
- A phone records a photo's rotation as metadata rather than in the pixels, and the conversion to PDF discarded it — so an upload could end up rotated in the PDF while looking upright on the phone that took it.

### Also
- The **ClubDesk export is now covered by tests**. ClubDesk maps columns by position, so a header added or removed without the matching change to the row shifts every field after it — surname into Vorname, street into PLZ — and the file still looks perfectly well-formed. The column list and the formula-injection guard are now pinned.

## [1.15.1] — 2026-07-25

### The National Team Declaration is gone — FIBA stopped accepting it
- Swiss Basketball opened the 2026-27 licence season on 23 July and replaced the **National Team Declaration** with the **Acknowledgment of National Team Restriction**. FIBA accepts only the new document. Every U18 foreign player who used our form was filing a form that would be rejected, so the old PDF is removed rather than left alongside the new one.
- The prefill was rewritten for the new form's fields. Two are deliberately left blank: the **federation of origin**, which we cannot know, and the **date of transfer**, which Swiss Basketball and FIBA set — a plausible guess in either box is worse than an empty one someone has to fill.

### Licence forms no longer break on a name with the wrong accent
- Filling any Swiss Basketball or FIBA form used to **fail outright for names like Šarčević, Győző, Öztürk or Łukasz**. The PDF fonts encode WinAnsi only, and one unsupported letter aborted the whole document — the applicant then silently received a **blank** form and no explanation. Accents WinAnsi does cover (ä ö ü é à ç ß Š ž) are kept exactly; only the letters it genuinely cannot carry lose their diacritic.
- A prefill that fails now says so in the error log instead of quietly handing over an empty PDF.

### Downloads no longer arrive truncated
- The download link released the file **the instant the click fired**, racing the browser writing it to disk. The bigger the document the likelier a half-written, unreadable PDF — and the new Acknowledgment form is ~590 KB, the largest of them. Affected both the public form and the admin's generated documents.

### The admin's Lizenzantrag had its fields off by one
- **Every generated Lizenzantrag put the data in the wrong boxes**: the email address in NAME, the surname in VORNAME, the street in the narrow PLZ box, and so on down the form. Verified against the field positions in the PDF itself. The public form was always correct; only the admin's copy was shifted.

### The Freibrief is no longer demanded from people who owe none
- Swiss Basketball waives the release letter when the player **held no licence in the last two seasons** or plays **U12 or below**. We asked everyone transferring from a Swiss club, sending some of them to chase a certificate their old club had no reason to issue. The form now asks about licence history — shown only when it can matter — and derives the youth categories from the date of birth already given. An unknown date of birth still requires the Freibrief: wrongly waiving it produces an incomplete dossier.

### Also
- Forms carry the **current season** rather than a hard-coded `2025/2026`, rolling over in July with Swiss Basketball's administrative year.

## [1.15.0] — 2026-07-17

### Registrations sorted by surname, surname first
- The signup table now leads with **Last name** and is **sorted by it**. It was newest-signup-first, which is the order they arrived in and no order at all when you are looking for a person. Sorted with Swiss collation, so **Dürig** sits between Demir and Mayer rather than after Z.

### "Email sent to …" is a toast
- The mail confirmation was a few pixels of grey text in the row, gone on the next redraw and easy to miss — poor for the one action here that reaches a real person. It is now a toast in the corner, showing the address the server actually sent to. A failure says *the result is recorded, only the mail failed*, and lingers longer, because it has to be read rather than just noticed.

### SVRZ Wohnort: looked up, not invented
- **Postcode and town are filled from the member records** when a signup didn't give them. The form asked for "Adresse" as one free-text box and most people read that as "street": 16 of 25 gave no town at all.
- Where nothing is known — not from the signup, not from the members — the list says **Zürich** without a postcode. That is a guess and it is the last resort: only about 70% of members live in Zürich, so guessing first would have been wrong for roughly one in three. The lookup found **Wädenswil** and **Stallikon** among people who would otherwise have been labelled Zürich.
- **The export says so before it runs.** A missing licence number and a guessed town are both listed for confirmation. A guessed Wohnort looks exactly like data once it is sitting in a spreadsheet cell.
- Implausible member data is dropped rather than forwarded: one record carries postcode `0849` (Swiss postcodes start at 1000) with the town `ZH` (a canton). Junk on an official list is worse than a blank, because it looks like an answer.
- The form has since been split into **Strasse / PLZ / Ort**, which is read directly when present. Signups made before the split still parse as they did.

## [1.14.0] — 2026-07-17

### The scoresheet column is a Matchblatt icon, and it says what it knows
- The tick is now a **Matchblatt icon whose colour is the state**: grey — no sheet, green — a sheet is on file, blue — a correction exists on top of it. A legend under the table spells that out, since a colour nobody can decode is decoration.
- **The icon is live even when grey.** Sheets also arrive by email or on paper, and the cell had nowhere to put one: the column was read-only unless the participant had used the upload page. The menu on an empty row now offers **Spielblatt hochladen (selbst erhalten)**, which files it as the participant's own sheet — not as a correction to nothing.
- Uploading the sheet itself is **refused once one exists**. To change a sheet that is already there, upload a correction: that keeps both and records who. An admin should not be able to quietly replace a submission.

### Download a scoresheet
- New **Spielblatt herunterladen** in the menu, saving as `schreiberpruefung_<licence>.pdf` — the same name the SVRZ zip uses, so a sheet saved here and the same sheet out of the zip are recognisably the same file.
- **Opening a sheet now always gives a PDF**, whatever the participant's phone produced — the same conversion the zip does, so what you read is what SVRZ receives. Previously a phone photo opened as a bare image and "save as" offered the blob's id as a filename. The stored original is untouched: it is the evidence of what they submitted.

## [1.13.0] — 2026-07-17

### Exam result is Yes / No, and emails either way
- The **"Prüfung bestanden" checkbox is now two buttons, Yes and No**. A checkbox holds two states and the question has three: passed, not passed, and nobody has looked yet. The third is the common one — every row on the platform today — and reading it as a fail would print **"Nicht bestanden"** against undecided people on an official SVRZ list. Undecided now exports as an empty cell, which is what it means.
- Both answers ask first, then email the participant the result automatically. The confirmation box carries an optional **note** — what went wrong, what to look out for — which is included in the email.
- Clicking the answer already showing **clears it back to undecided**, silently: there is no longer a result, so there is no email to send. (The earlier one has already gone out; only a person can follow that up.)
- Recorded separately from the old `exam_passed`, which is kept — dropping the checkbox is no reason to discard what was recorded through it.

### Admin can upload a corrected scoresheet
- The tick under **Prüfung hochgeladen** opens a menu instead of the file: show the participant's sheet, show the correction, upload or replace one. Once a correction can exist, "open" is no longer one unambiguous action.
- **The participant's sheet is never overwritten.** It is what they submitted; a correction is a separate claim on top of it, and both stay readable. The menu names **who** corrected it and when — resolved from the admin's login server-side, so it cannot be forged — and the tick turns amber so corrected rows are scannable.
- The result email **attaches the corrected sheet as a PDF** when one exists. Not the participant's own: they uploaded that and have it already.

### SVRZ export: PDFs named by licence number
- Zip entries are now `schreiberpruefung_<licence>.pdf`, the correction winning over the original. Licence numbers are reduced to digits the way the upload route does, so the same licence cannot name two files differently depending on who typed it.
- **Phone photos are converted to PDF**, so SVRZ receives PDFs throughout. The export **warns before running** if anyone is missing a licence number — SVRZ needs it on the Teilnehmerliste regardless.

### Scoresheet uploads no longer accept HEIC
- PDF, JPG and PNG only. Chrome and Firefox cannot decode HEIC, so such a sheet could be neither previewed in `/admin` nor folded into the PDF the export ships — we would have stored a file nobody downstream can open. Refusing at upload tells the participant while they can still re-shoot it; iOS Safari transcodes to JPEG through a file input anyway.

### Fixed
- **The exam-passed email's body text was invisible.** It renders on a dark navy card and the body paragraph set no colour, so it fell back to the client default — near-black on navy. Shipped that way in 1.11.0; found by rendering the template rather than reading it. Nobody had received it yet.

## [1.12.0] — 2026-07-16

### Sign-up deadline on scorer courses
- A scorer course can now carry a **registration deadline** (`/admin/?tab=scorer_courses` → edit a course). Entered as a date and time in Swiss time; leaving it empty keeps the course open right up to the course date, exactly as before.
- While the deadline is still ahead, the course card on **[/weiteres/schreiberkurse](https://kscw.ch/weiteres/schreiberkurse)** says **«Anmeldung möglich bis 12.08.2026 00:00»**, so the cut-off is visible before it bites rather than only afterwards.
- Once it passes the card **locks rather than disappears**: the sign-up button is replaced by *Anmeldung geschlossen*, while the date, venue and *Zum Kalender hinzufügen* stay — people who already signed up still need those. The card itself only leaves the page once the course date has passed, as it always did.
- Saving the deadline also **closes the sign-up form itself**, so a late sign-up is actually turned away rather than merely hidden — the link from an old email no longer quietly accepts submissions. If a deadline has been changed directly in OpnForm, the admin form says so instead of silently overwriting it unnoticed.

## [1.11.0] — 2026-07-16

### Participants upload their own exam scoresheet
- New page **[/weiteres/schreiberkurse/pruefung](https://kscw.ch/weiteres/schreiberkurse/pruefung)** where a course participant uploads the scoresheet from their practical exam themselves — no login, no account. It is linked from the Schreiberkurse page, and the announced umlaut address (`…/prüfung`) leads to the same place.
- **Who may upload is decided by the sign-up list**: you enter the email address you registered the course with, and only an address that is actually on a scorer course's list gets through. The page then greets you by name and, if you're on more than one course, asks which one.
- **SVRZ licence number** is asked at upload — it's what lets us register the exam with the SVRZ — and is pre-filled when we already have it. Spaces and dots are accepted (`337 646` → `337646`).
- PDF, JPG, PNG or HEIC up to 10 MB; a phone photo of the sheet is fine. The file type is checked by its actual content rather than its name, and anything else is refused. Uploading again replaces the previous sheet instead of piling up copies.
- The upload sets **Prüfungsdatum** to the day the sheet arrives, and fills in the licence number — so a participant uploading their sheet completes their own row on the SVRZ Teilnehmerliste. Admins can still correct both by hand.
- Scoresheets are **private**: they are stored outside the public file area and can only be opened from `/admin`, never by URL.

### Admin: ticking "Prüfung bestanden" now confirms and notifies
- Ticking **Prüfung bestanden** asks for confirmation first and then emails the participant a bilingual confirmation automatically. The address comes from their sign-up, never from the browser. **Un**ticking is silent — it's a correction, and sends nothing.
- The confirmation warns if no scoresheet was ever uploaded for that person, which is the usual sign of a tick on the wrong row.

### Schreiberkurse and Mitgliedschaft use the whole screen
- **Schreiberkurse**: the intro and sign-up text sat hard against the left edge on a wide screen — they're now centred, and the resource cards spread across the full width instead of stacking in a narrow column.
- **Mitgliedschaft**: the page ran down one narrow column with the right half of the screen empty. The volleyball fees, licence fees and basketball fees now sit side by side, the three registration steps read left-to-right, and *Als Gast mitmachen* / *Passivmitglied werden* sit next to each other. Everything still stacks on a phone.

## [1.10.0] — 2026-07-16

### Admin: the Excel export is now SVRZ's own participant list
- The **Excel export** on a scorer course (`/admin/?tab=scorer_courses&course=<id>`) no longer produces a generic table — it produces **SVRZ's own «Schreiberkurs Teilnehmerliste»**: the RSK Swiss Volley Region Zürich letterhead, the grey header band and their 13 fixed columns (Kursdatum, Prüfungsdatum, Prüfungsresultat, Vereinsname, Lizenz-Nr., Name, Vorname, Strasse, PLZ, Wohnort, Telefon, E-Mail, Geb. Datum), ready to send on without retyping. The file is always in German — it is SVRZ's form, not our interface, so it does not follow the admin language. The **TSV export is unchanged**.
- Each row is dated from the course behind its own sign-up form, so the combined **DE + EN** view lists every participant with the right course date. Works the same for an English-only, a German-only or a combined course.
- The sign-up form asks for the address in one line; the export **splits it** into Strasse / PLZ / Wohnort. If a line doesn't follow the usual «Strasse 1, 8001 Zürich» shape it is left whole in the Strasse column rather than risk a house number landing under PLZ on an official list.
- **Prüfungsresultat** reads *Bestanden* only for participants actually ticked as passed — nobody is labelled as having failed merely because they haven't sat the exam yet.
- New **Schreiberexperte** field on a scorer course, printed on the list's header line. In the combined view it stays blank unless every course agrees, rather than putting a guessed name on an official document.

### Admin: exam scoresheets
- The registrations table gained a **Spielblatt** column showing whether a participant's exam scoresheet has been uploaded, and the **▸** detail view gained an editable **Prüfungsdatum**.
- The Excel export now downloads the participant list **together with every uploaded scoresheet** as a single zip.

## [1.9.0] — 2026-07-13

### Admin: Excel export for scorer courses — now including the tracking columns
- The scorer-course registrations view (`/admin/?tab=scorer_courses&course=<id>`) gained an **Excel export** next to the existing TSV one: a real `.xlsx` with a frozen, bold header row, a filter on every column, and the present / exam-sent / exam-passed ticks written as true Excel booleans so they can be filtered and counted. Licence numbers stay text, so a leading zero is never swallowed.
- **Fixed:** both exports silently dropped everything KSCW tracks itself — **present**, **exam sent**, **exam passed**, **SV licence** and **notes**. The export was built from the sign-up form's answers alone, while the tracking lives in a separate collection (`scorer_course_attendance`), so an SV licence entered by an admin (the usual case for a new referee) never made it into the file. Exports now carry exactly what the table shows, including edits made just before exporting.

## [1.8.1] — 2026-07-09

### Admin: scorer registration details — one field per row
- The expanded sign-up (the **▸** detail view in the scorer-course registrations table) now lists each field on its own line — date, phone, email, address, birthdate, language, participation, KSCW membership, club/team and notes stack vertically instead of wrapping several per line, so a registrant's details are easier to scan.

## [1.8.0] — 2026-07-09

### Admin: scorer-course registrations — compact rows, SVRZ pre-fill & bulk email
- The inline registrations table (`/admin/?tab=scorer_courses&course=<id>`) now shows a **compact row** — first name, last name, the present / exam-sent / exam-passed toggles, the licence field and delete — so it fits on screen without sideways scrolling. A **▸** arrow (or a click on the name) expands the full sign-up: phone, email, address, birthdate, participation, team, notes and everything else, plus the editable tracking note.
- The **SV licence** field is **pre-filled** from the sign-up's *SVRZ Licence Number* answer when the applicant provided one and it hasn't been tracked yet (a value you've already entered always wins). Saves as before, only when you edit it.
- New **Send email** button: it reveals a per-registrant checkbox (all selected by default, with a select-all box), then opens your default mail program with the chosen participants pre-addressed — for quick "message everyone on this course" mails.

## [1.7.0] — 2026-07-09

### Admin: scorer-course registrations, inline with attendance & exam tracking
- The website admin (`/admin`) now supports deep-linkable tabs — the address bar carries the open section (e.g. `/admin/?tab=scorer_courses`, and `&course=<id>` for one course's registrations), so a view can be bookmarked or shared and the browser Back/Forward buttons move between sections.
- Scorer-course sign-ups now open **inline** (no pop-up) as an editable table. For each registrant you can tick **present**, **exam sent** and **exam passed**, add a **note**, and fill in a **Swiss Volley licence number** when the applicant didn't provide one. Changes save immediately.
- The sign-ups themselves stay read-only; the tracking lives in a new Directus collection (`scorer_course_attendance`) keyed to each sign-up — the form provider (OpnForm) has no place to store it. Exposed through the existing `scorer_courses` admin grant; all fields are scalar so the section-scoped-admin guards apply unchanged.

## [1.6.0] — 2026-07-09

### Basketball registration: full Swiss Basketball document flow
- The membership form now asks basketball applicants which licensing **situation** applies — new licence, transfer from another Swiss club, coming from a club abroad, or returning to Switzerland — and requests exactly the documents Swiss Basketball's licensing procedure needs for that case. Previously only "new player" was handled (plus the two FIBA forms for non-Swiss applicants), so transfers had no way to submit their **release letter (Freibrief)**.
- New documents are collected when relevant, with auto-filled templates to download: the **Freibrief** (transfer from a Swiss club), the FIBA **parental consent (U18)** and an optional **school-enrolment certificate** (for under-18 international transfers/returners). Whether the National Team Declaration / U18 documents are required is derived from the applicant's date of birth, and the licence application PDF is now pre-ticked for the correct case (new member / club transfer / international transfer).
- The signed Lizenzantrag (Swiss Basketball licence application) template was updated to the current version.
- Documents that don't apply to your situation are never shown and never block submission; the optional school certificate never blocks it either.

## [1.5.2] — 2026-07-07

### Registration: reliable team loading
- The team list on the membership form was fetched lazily (only after sport + role were picked) and failed silently on flaky connections, leaving an empty dropdown and an unresolvable "no team selected" error at submit. Teams are now prefetched when the form opens, network failures are surfaced with a "Try again" retry (and logged instead of swallowed), and in-flight requests are deduplicated.
- Mixed youth basketball categories (MU8, MU10 and the U12 "Mix" league) were mis-tagged as male-only and hidden from female applicants — they now appear for both sexes.

## [1.5.1] — 2026-07-06

### Calendar: numbered referees
- Referees in the game popup are now listed one per line with their official role — "1. Schiedsrichter" / "2. Schiedsrichter" (EN: "1st referee" / "2nd referee") — instead of a single comma-joined row.

## [1.5.0] — 2026-07-06

### Calendar: full game details
- The game detail popup in the calendar now shows the league, the official game number (Swiss Volley / Basketplan) and — for volleyball — the assigned referees. Referee data comes live from Directus (`games.referees_json`, now publicly readable); new-season games show no referees until Swiss Volley publishes the assignments.

### Scorer courses: 2026 materials
- The four separate PDF/PPT download cards (DE + EN each) are replaced by two cards linking the new 2026 course files: the course materials PDF and the course presentation (PowerPoint on Google Slides).

## [1.4.0] — 2026-07-06

### Scorer courses: fully editable in the admin panel
- The venue address, the "Hosted by … / Powered by …" note and the course duration (used for the length of the "add to calendar" entry) were hardcoded in the website and could not be changed without a code deployment. They are now per-course fields in Directus, editable in `/admin` → Scorer courses alongside title, date, time, mode and sign-up forms. Leaving the venue or host note empty hides that line on the public course card; new courses prefill the usual Irchel/Spada defaults.

## [1.3.1] — 2026-06-30

### Calendar: instant month navigation
- The calendar re-fetched games and hall closures from Directus every time you changed month, flashing a loading spinner on each prev/next/today click. Both collections are small and bounded to the season, so the whole dataset now loads once when the page opens and month navigation is instant — no spinner, no refetch. (Newly entered games still appear after a page reload, as before.)

## [1.3.0] — 2026-06-26

### Basketball youth: live open / waiting-list status
- The basketball youth page (`/basketball/teams/nachwuchs`) baked each team's "Open for players" badge + contact link and the "Team full" / waiting-list button into the page at build time, so a change only showed after a full site rebuild. That status is now refreshed live in the browser from Directus: flipping a team's `open_for_players` (or setting a waiting-list link) appears immediately, no rebuild needed. The build-time render stays as the no-JS / instant-paint fallback.
- Note: the "Team full" / waiting-list button still requires the `waitlist_url` field to be readable by Directus's **Public** role. It is currently locked, so those buttons stay hidden (both the page logic and the new live fetch handle this gracefully) until that read permission is granted — at which point they appear with no further code change.

## [1.2.2] — 2026-06-26

### Youth registration unblocked + confirmation screen fixed
- The membership form silently refused to submit for younger applicants (under 23 volleyball / under 25 basketball): the AHV field of the *non-selected* sport stayed mandatory while hidden, so the browser blocked submission with no message at all — no confirmation email, no record was created. The AHV requirement now applies only to the sport actually selected, so youth sign-ups go through.
- The "thank you" confirmation that appears after a successful sign-up was styled with page-scoped CSS that never matched the dynamically-created element, so it rendered invisibly — a successful submission looked like nothing happened. The confirmation now displays correctly.

## [1.2.1] — 2026-06-25

### Registration form captcha fixed
- On a long registration (e.g. basketball, with document downloads and uploads), the Cloudflare Turnstile security check could expire before submitting and silently block the form — the applicant got stuck with nothing logged. The check now auto-refreshes its token while the form is open, recovers from transient challenge errors instead of crashing the page, and shows a clear "please re-confirm" message if it ever lapses. Client-side submit blocks (expired captcha, missing file/team) are now logged so failures are diagnosable.

## [1.2.0] — 2026-06-25

### Hall closures in the calendar
- The calendar now shows "Halle geschlossen" days — school holidays, public holidays and hall closures (e.g. for tournaments), read from the `hall_closures` collection. The many per-hall rows are collapsed into one marker per day/reason listing the affected halls, with a detail modal. A toolbar toggle shows/hides them (default on).
- Calendar subscription fixed and extended: the subscribe/download links pointed at a dead path (`/api/ical`) and are corrected to the live feed (`/kscw/ical`); hall closures are now an opt-in subscribe source. Also fixes a latent bug where selecting every source omitted the `source` filter and silently dropped events from the subscription.

## [1.1.1] — 2026-06-24

### Calendar & event dates fixed
- All-day events (e.g. the Photoday) showed up one day too early in the calendar and on the homepage. Dates are now always read in Swiss time (Europe/Zurich), so they land on the correct day regardless of where the visitor is.
- News dates are likewise pinned to Swiss time for consistency.

## [1.1.0] — 2026-06-20

### Standings by season
- Team-page standings now have a season picker — current tables, last season's final standings (2024/25 added back) and the archive. Driven off the rankings data directly, so it stays correct after teams roll over to the new season in June (when standings aren't published yet).
- For a season Swiss Volley hasn't published yet, a short "Data to be shared later by Swiss Volley" note appears instead of an empty table.

## [1.0.0] — 2026-06-19

First official release of the KSC Wiedikon website — a fast, bilingual (DE / EN) Astro static site backed by the club's Directus API and hosted on Cloudflare Pages. The sections below describe what the site does at 1.0.

### Site & navigation
- Bilingual German / English site with a single canonical URL per page and a client-side language toggle that remembers your choice.
- Live on the club's own domain, kscw.ch.

### Teams
- Dynamic team pages (volleyball + basketball) with live data from Directus: games, rankings, roster, photos and a weekly training summary derived from the real hall schedule.
- Promotion / relegation colour bands on rankings, season-stable team matching that survives the yearly rollover, and a basketball youth section with live coaches and training times.

### Games, scoreboard & calendar
- Homepage game rows and a game detail modal with sets, referees and venue.
- A scoreboard with Absolute / Per-Game toggle, and a live calendar with event tooltips and detail modals.

### Registration & membership
- A unified online registration form for volleyball, basketball and passive memberships, with ID upload, PDF pre-fill of the licence forms and Turnstile spam protection.
- An admin registrations tab with approve / reject workflow, ClubDesk CSV export and automatic confirmation emails.

### News, events & courses
- Club news on the homepage and a dedicated news page with RSS, calendar events with sign-up links and live submission counts, and scorer courses with an "add to calendar" button.

### Contact & feedback
- A central contact form that reaches the right coaches without exposing their email addresses, and a feedback form (bug / feature / feedback) with screenshot upload that opens a GitHub issue automatically.

### Content pages
- About us with club history and a map, the board as an org chart, regulations with SVRZ embeds, sponsors, imprint and privacy policy.

### Design & polish
- Animated hero, scroll-progress bar, card spotlight, 3D-tilt team cards and section-aware sparkle effects — all respecting "reduce motion".
- Swiss dd.mm.yyyy dates and HH:MM times throughout, with a dark / light theme.

### Admin & infrastructure
- A hidden admin area with per-person area permissions enforced on the server, not just hidden in the UI.
- Built on Astro 6 with a Directus REST backend, Cloudflare Pages hosting and hardened CSP / security headers.
