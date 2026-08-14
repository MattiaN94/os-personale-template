# Personal OS — template

Template self-hosted di un "sistema operativo personale" a utente singolo: una PWA
React, un Worker Cloudflare e un Custom GPT privato opzionale. Gestisce in versioni
tracciate salute, nutrizione, finanza, documenti, scadenze, casa, veicolo,
assicurazioni e agevolazioni.

**Questo repository contiene solo codice.** Nessun dato personale, documento,
export, backup o segreto. Ogni identificatore d'infrastruttura è un segnaposto da
sostituire con il tuo: cerca `YOUR-` e `REPLACE_WITH_` prima del primo deploy.

Il progetto nasce per un uso personale reale. È condiviso perché possa servire a
chi vuole costruirsi qualcosa di simile, non come prodotto: non c'è multi-tenancy,
non c'è onboarding, e diverse scelte sono deliberatamente rigide.

## Idea di fondo

Tre principi guidano l'architettura, e spiegano quasi tutte le decisioni:

1. **Nessun dato diventa canonico da solo.** Il GPT e la PWA creano *proposte*; il
   proprietario conferma. Una correzione non sovrascrive: crea una nuova versione
   collegata alla precedente, che resta consultabile.
2. **Ogni numero dichiara la propria provenienza.** Ogni record porta un
   `evidence_status`: verificato, dichiarato, stimato o pianificato. Una stima non
   viene mai confusa con un dato verificato.
3. **I documenti sono cifrati sul dispositivo.** La passphrase non lascia il
   browser. Il server conserva soltanto testo cifrato.

## Architettura

- PWA e API condividono un solo hostname Cloudflare Worker.
- Cloudflare Access autentica il proprietario e il service token del GPT.
- Cloudflare D1 è l'archivio strutturato canonico, con versioni e audit
  append-only.
- Due bucket R2 privati conservano documenti cifrati e backup cifrati del
  database.
- I campi a riservatezza massima usano buste AES-256-GCM legate al workspace.
- Il GPT legge contesto minimizzato: conferma, rifiuto e correzione restano azioni
  del proprietario nella PWA.

Estrazione testo e OCR girano **sul dispositivo**. La Content-Security-Policy
consente solo risorse di prima parte: nessuna CDN a runtime.

## Prerequisiti

- Node.js 22+ e pnpm 11+
- Un account Cloudflare con Workers, D1, R2 e Zero Trust attivi
- `wrangler` autenticato: `npx wrangler login`

## Replicare l'istanza

### 1. Risorse Cloudflare

```bash
npx wrangler d1 create personal-os
npx wrangler r2 bucket create personal-os-documents --jurisdiction eu
npx wrangler r2 bucket create personal-os-backups --jurisdiction eu
```

Riporta il `database_id` restituito dal primo comando in
`workers/api/wrangler.jsonc`. Se non ti serve la giurisdizione UE, ometti
`--jurisdiction` e rimuovi `"jurisdiction": "eu"` dalla configurazione.

### 2. Cloudflare Access

In Zero Trust crea un'**applicazione self-hosted** sull'hostname del Worker, con:

- una policy **Allow** che consenta soltanto la tua email (attiva la MFA);
- una policy **Service Auth** con un **service token**, se vuoi usare il GPT.

Poi compila in `workers/api/wrangler.jsonc`:

| Campo | Dove trovarlo |
| --- | --- |
| `APP_ORIGIN` | l'URL del tuo Worker |
| `CF_ACCESS_TEAM_DOMAIN` | il tuo team domain Zero Trust |
| `CF_ACCESS_AUD` | il tag AUD dell'applicazione Access |

### 3. Segreti

```bash
pnpm install --frozen-lockfile
```

Copia `.dev.vars.example` in `workers/api/.dev.vars` e genera le chiavi di
recupero. Su Windows lo script usa DPAPI sull'utente corrente:

```powershell
pwsh scripts/protect_recovery_keys.ps1
```

Su altri sistemi genera due chiavi da 32 byte in base64 e conservale in un gestore
di password:

```bash
openssl rand -base64 32
```

**Senza queste chiavi i campi cifrati e i backup non sono recuperabili.** Mettile
al sicuro prima di archiviare qualsiasi dato reale.

Carica ogni segreto sul Worker:

```bash
npx wrangler secret put OWNER_EMAIL_SECRET --config workers/api/wrangler.jsonc
```

Ripeti per `WORKSPACE_ID_SECRET` (un UUID che generi tu),
`GPT_SERVICE_TOKEN_ID_SECRET` (il Client ID del service token),
`BACKUP_ENCRYPTION_KEY`, `FIELD_ENCRYPTION_SECRET` e, solo con il calendario
attivo, `GOOGLE_OAUTH_CLIENT_SECRET` e `GOOGLE_CALENDAR_TOKEN_KEY`.

`OWNER_EMAIL_SECRET` deve corrispondere **esattamente** all'email con cui Access
ti autentica: se differisce, l'app si apre ma ogni chiamata API risponde `403`.

### 4. Database e pubblicazione

```bash
pnpm run d1:migrate
pnpm run deploy
```

`deploy` scarica il runtime OCR locale, compila e pubblica. Apri l'app e controlla
che **Impostazioni** mostri "Attivo" su Access, D1, archivio documenti e GPT.

### 5. GPT privato (opzionale)

`docs/gpt-setup.md` e `docs/gpt-instructions.md` descrivono la configurazione;
`docs/personal-os-actions.openapi.yaml` è lo schema delle Actions. Il GPT si
autentica con il service token di Access e può creare **solo proposte**.

## Uso quotidiano

| Sezione | A cosa serve |
| --- | --- |
| **Oggi** | Brief operativo, prossima scadenza, qualità dei dati, stato personale |
| **Patrimonio** | Sintesi, portafoglio, budget contro effettivo, proiezioni, simulatore ISEE |
| **Salute** | Check-in, nutrizione, trend con medie mobili, sezione clinica |
| **Casa e tutele** | Manutenzioni, garanzie, regole normative, agevolazioni monitorate |
| **Scadenze** | Calendario operativo; le scadenze derivate nascono da regole con fonte |
| **Insights** | Cosa è cambiato: confronti oltre soglia di materialità, con evidenze |
| **Documenti** | Caricamento cifrato sul dispositivo e download verificato |
| **Fonti dati** | Verifica delle fonti prima che i dati diventino canonici |
| **Conferme** | Coda delle proposte con confronto prima/dopo |
| **Storico** | Audit append-only |
| **Impostazioni** | Backup, calendario, import salute, costituzione personale |

Se una proposta è legata a una fonte, quella fonte va prima verificata in **Fonti
dati**, altrimenti la conferma viene rifiutata con `source_not_verified`.

### OCR locale

```bash
pnpm run vendor:ocr
```

Scarica in `public/tesseract` il worker Tesseract, i tre core WebAssembly LSTM e i
modelli italiano e inglese (~15 MB). I binari restano fuori da Git ed è `deploy` a
rigenerarli. Senza questi file l'OCR delle immagini viene saltato con un messaggio
esplicito e il documento viene comunque archiviato; l'estrazione dei PDF continua
a funzionare.

### Localizzazione

L'interfaccia è in italiano e diversi contenuti sono specifici dell'Italia: il
simulatore ISEE, il catalogo di regole e agevolazioni, il fuso `Europe/Rome`, la
formattazione valuta in EUR. Adattarli a un altro paese richiede di sostituire
`estimateOrdinaryIsee` in `shared/analytics.ts`, le regole in
`d1/migrations/0003_specialist_modules.sql` e le etichette in `src/`.

## Sviluppo locale

```bash
pnpm run dev          # solo interfaccia
pnpm run dev:worker   # Worker + API + asset compilati
```

In locale servono `LOCAL_DEV_MODE=true` e `ACCESS_ENFORCED=false` in
`workers/api/.dev.vars`: l'identità proprietario viene simulata solo su
`localhost`. Senza API raggiungibile l'app mostra "API non avviata" e **non**
carica dati dimostrativi: il progetto non include fixture, per non confondere mai
un dato finto con uno reale.

## Verifica

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
```

I test in `tests/security` bloccano regressioni su cancellabilità dei dati,
separazione proprietario/GPT, minimizzazione del contesto, cifratura dei campi e
origine delle risorse a runtime.

## Diagnostica

| Sintomo | Causa probabile |
| --- | --- |
| Sessione da rinnovare | Sessione Access scaduta: usa "Accedi di nuovo" |
| L'app si apre ma risponde `owner_required` | `OWNER_EMAIL_SECRET` diverso dall'email di Access |
| `Failed to fetch` dopo il login | Service worker obsoleto: deregistralo e ricarica |
| `source_not_verified` alla conferma | Verifica prima la fonte in **Fonti dati** |
| Estratto saltato su un'immagine | Manca il runtime OCR: esegui `pnpm run vendor:ocr` |
| `storage_not_enabled` | Bucket R2 o flag corrispondente non attivi |

```bash
npx wrangler tail --config workers/api/wrangler.jsonc
```

## Documentazione

- `docs/guida-operativa.md`: guida operativa.
- `docs/requisiti-e-copertura.md`: matrice requisiti / codice / test.
- `docs/metodologia-indicatori.md`: formule, assunzioni e limiti.
- `docs/data-sources.md`: checklist delle evidenze canoniche.
- `docs/deployment.md`: runbook di deployment e ripristino.
- `SECURITY.md`: modello di minaccia e controlli.

## Come leggere Insights

Insights risponde a una domanda diversa da **Oggi**: non "qual è la situazione",
ma "cosa è cambiato". Le card nascono dalle stesse formule delle schede
specialistiche — deriva dai pesi obiettivo, concentrazione, variazione del
patrimonio a 12 mesi, tasso di risparmio, copertura di liquidità, budget,
puntualità delle scadenze, quota di stime.

Ogni card compare **solo oltre una soglia di materialità**, dichiarata nel caveat
della card stessa. Quattro allenamenti contro tre è aritmetica, non
un'osservazione: se una card non appare, la differenza non ha superato la soglia.
Le soglie sono raccolte in `MATERIAL` in `shared/core-plus.ts`, se vuoi tararle
sul tuo caso.

## Assunzioni di metodo

Due scelte che cambiano il significato dei numeri, rese esplicite perché chi
replica il progetto possa contestarle:

- **Indipendenza finanziaria sul capitale investibile.** Portafoglio più
  liquidità; immobili e posizioni previdenziali sono esclusi. Un'abitazione non
  finanzia un prelievo, e contarla gonfierebbe "anni di spesa coperti".
- **Copertura misurata sulla cadenza osservata.** Una metrica settimanale con 13
  letture in 90 giorni è coperta al 100%, non al 14%. Sotto due osservazioni la
  cadenza non è determinabile e la copertura non viene mostrata anziché indovinata.

## Limiti dichiarati

Le proiezioni finanziarie sono scenari, non previsioni: non includono fiscalità né
la sequenza reale dei rendimenti. La stima ISEE è orientativa e non sostituisce la
DSU né l'attestazione INPS. I segnali dei dispositivi consumer non sono strumenti
diagnostici. Nessuna parte del progetto costituisce consulenza finanziaria o
medica.

Questo template è fornito così com'è, senza garanzie. Se lo usi, sei tu il
responsabile dei tuoi dati, delle tue chiavi e della tua configurazione Cloudflare.

## Licenza

MIT — vedi [LICENSE](LICENSE). Puoi usarlo, modificarlo e ridistribuirlo, anche
per scopi commerciali, mantenendo l'avviso di copyright. Nessuna garanzia.
