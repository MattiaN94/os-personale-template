# Requisiti e copertura

Questa matrice collega le richieste funzionali alla loro implementazione e al
controllo disponibile. `Pronto` significa che struttura, calcolo e stato vuoto
esistono; il risultato personale compare solo dopo fonti riconciliate.

## Sistema e sicurezza

| Requisito | Stato | Implementazione e controllo |
| --- | --- | --- |
| PWA privata web/iPhone | Pronto | React PWA e Worker sullo stesso hostname; layout responsive e manifest installabile. |
| Input naturale da ChatGPT | Pronto | GPT privato con Actions ristrette a contesto, ricerca, proposta, correzione e upload protetto. |
| Nessuna API OpenAI a consumo | Pronto | La comprensione avviene nel GPT; il Worker non chiama API di modelli. |
| Cloudflare come piattaforma dati | Pronto | Worker, D1 e due bucket R2 privati; GitHub contiene solo codice. |
| Accesso a due livelli | Pronto | Cloudflare Access MFA per il proprietario e validazione JWT nel Worker; identita GPT separata. |
| Dati canonici versionati | Pronto | Proposte, conferma proprietario, `supersedes_item_id`, idempotenza e audit append-only. |
| Privacy per mostrare la PWA | Pronto | Switch persistente che maschera metriche, tabelle, grafici, proposte, simulatori e input valorizzati. |
| Documenti cifrati | Pronto | AES-256-GCM nel browser, chiave file avvolta, R2 privato e hash del contenuto. |
| Backup cifrati | Pronto | Envelope AES-GCM separato, job pianificato e ripristino locale con riconciliazione tabelle. |
| Nessun dato dimostrativo | Pronto | Nessun fallback locale o dataset campione; una sessione Access scaduta produce una riconnessione esplicita. |

## Salute e nutrizione

| Requisito | Stato | Implementazione e controllo |
| --- | --- | --- |
| Import Apple Health | Pronto | Import locale con sorgente, fuso, unita, hash e revisione; un nuovo snapshot verificato supersede il precedente senza cancellarlo. |
| Catalogo metriche completo | Pronto | Energia, passi, distanze, frequenze, HRV, VO2max, ossigeno, respirazione, temperatura, daylight, stabilita e metriche di cammino/corsa; nuove chiavi restano esplorabili. |
| HRV | Pronto | SDNN esplicita, ultimo valore, medie 7/60 giorni, rapporto, sorgente e numerosita; nessuna conversione rMSSD. |
| Trend e analisi temporale | Pronto | Valore giornaliero, media mobile 7/60, finestre 28/90/365, 90 precedenti, copertura, media, mediana, estremi, deviazione standard, pendenza OLS e aggregazione mensile. |
| Peso e misure | Pronto | Conversione kg/lb, media 7 giorni e misure GPT aggiuntive: circonferenze, grasso, pressione, glicemia, temperatura e altre chiavi. |
| BMI e metabolismo | Pronto | BMI unit-safe e Mifflin-St Jeor con dati espliciti e limiti plausibili. |
| Dispendio energetico | Pronto | Mediana su giorni completi energia attiva+basale, fino a 90 giorni e con sorgenti dichiarate. |
| Sonno | Pronto | Ore valide, efficienza, profondo e REM; serie e copertura. |
| ECG e percorsi | Pronto | Riepiloghi datati senza diagnosi; route e attivita osservate come contesto. |
| Diario alimentare da foto | Pronto | Pasto, componenti, quantita note, kcal, macro, fibre, sodio, confidenza, intervallo e riferimento foto. |
| Target nutrizionali flessibili | Pronto | Manutenzione/deficit/crescita, proteine e grassi per kg, carboidrati residui, passi e variazione teorica; tutte le ipotesi sono dati versionati. |
| Analisi di aderenza | Pronto | Totali giornalieri, calorie da macro, scarto, intervallo kcal e pasti stimati. |

Controlli principali: `tests/contracts/analytics.test.ts`,
`tests/contracts/health-import.test.ts`, `tests/security/schema.test.ts` e il
modulo `src/modules/SpecialistModules.tsx`.

## Patrimonio e finanza

| Requisito | Stato | Implementazione e controllo |
| --- | --- | --- |
| Baseline patrimoniale | Pronto | Ultima fotografia per identificativo, quota di possesso, attivi, passivi, netto e controllo delle date. |
| Conti, debiti, mutuo e pensione | Pronto | Tipi separati, valuta, precisione, fonte e versioni indipendenti. |
| Cash flow e spese | Pronto | Entrate, spese, netto, risparmio YTD, categorie e medie su mesi osservati. |
| Storico patrimonio | Pronto | Ultimo valore mensile, variazione 12 mesi, CAGR, migliore/peggiore mese. |
| PAC flessibili | Pronto | Ogni operazione e datata; una correzione non cambia altri mesi o strumenti. |
| Posizioni portafoglio | Pronto | ISIN/codice, classe, valore, costo, P/L, peso, target e scostamento. |
| Diversificazione | Pronto | HHI, posizioni equivalenti, peso massimo e distribuzione per classe. |
| Geografia | Pronto | Esposizioni per prodotto ponderate sul valore; copertura, quota non classificata e sovra-allocazione. |
| Rendimenti | Pronto con fonti | Periodo, annualizzato, volatilita, drawdown e scarto benchmark su date comuni; niente rendimento inventato da variazioni di saldo. |
| Proiezioni | Pronto | Scenari prudente/base/alto con rendimento, costi, inflazione, contributi e crescita. |
| Simulazione statistica | Pronto | Monte Carlo riproducibile, volatilita, percentili 10/50/90 e probabilita rispetto ai contributi reali. |
| Autonomia capitale | Pronto | Nessun reddito, solo passivo e reddito temporaneo; anni di spesa, capitale teorico e copertura. |
| ISEE automatico e simulatore | Pronto con fonti | ISE/ISP/scala, saldi e giacenze, eccezione documentata, immobili/mutui, esclusione eleggibile e modalita normativa separata. |

Il calcolo ufficiale di TWR/XIRR richiede NAV e tutti i flussi esterni; il
risultato ufficiale ISEE richiede INPS/CAF. La PWA evita di mostrare questi dati
come verificati finche le fonti non sono sufficienti.

## Casa, auto, assicurazioni e bonus

| Requisito | Stato | Implementazione e controllo |
| --- | --- | --- |
| Dati catastali | Pronto | Comune, sezione, foglio, particella, subalterno, categoria/classe, consistenza, rendita, superficie e quota. |
| Bollette e consumi | Pronto | Periodo, costo firmato, consumo/unita, ripartizione per giorni, costo unitario e conguagli. |
| Manutenzioni e garanzie | Pronto | Bene, intervento, fonte, prossima verifica, regola collegata e versioni. |
| Scadenze automatiche | Pronto con fonti | Regole calcolate in Europe/Rome; obbligo legale, manuale e controllo per condizione rimangono distinti. |
| Polizze | Pronto | Premio, copertura, rinnovo, disdetta e scadenza con identificativi minimizzati. |
| Costo auto completo | Pronto | Acquisto, residuo, svalutazione, costi e rimborsi documentati, costo opportunita, annuo/mese/km e storico per categorie. |
| Quotazione auto | Pronto con fonte | Accetta una quotazione datata e documentata; nessuno scraping o valore inventato. |
| Obblighi auto | Pronto con fonti | Revisione, RC, bollo, dotazioni, manuale, chilometri e usura con catalogo ufficiale versionato. |
| Bonus e agevolazioni | Pronto | Catalogo nazionale/regionale/locale, requisiti, date, fonte e review periodica. |
| Monitor mensile | Pronto con avvio GPT | Cloudflare apre i run dovuti; il GPT, richiamato dall'utente, ricerca le fonti e crea proposte. Nessuna falsa ricerca autonoma senza API di modello. |

## Input e qualita

| Requisito | Stato | Implementazione e controllo |
| --- | --- | --- |
| Foto e documenti via GPT | Pronto | Estrazione in proposta con allegato trattato come contenuto non attendibile. |
| File sensibili via PWA | Pronto | Upload cifrato e, quando autorizzato, estratto mascherato temporaneo. |
| Correzione rapida | Pronto | Ricerca del record, confronto prima/dopo e nuova versione senza riscrivere lo storico. |
| Fonte e affidabilita | Pronto | Stati verificato/dichiarato/stimato/pianificato, hash, ente, periodo e freschezza. |
| Duplicati documentali | Pronto | Hash identico; titolo o nome non bastano. |
| Dati mancanti | Pronto | Celle e grafici restano vuoti; non vengono trasformati in zero. |
| ChatGPT Library | Procedura documentata | Dopo conferma e archiviazione, eliminazione manuale del file dalla Library e poi della chat. |

## Limiti espliciti

- Nessuna piattaforma gratuita puo essere garantita gratuita o disponibile per
  sempre; quote e condizioni vanno monitorate.
- Monitor normativi e bonus devono consultare fonti aggiornate: il catalogo non
  sostituisce la verifica al momento dell'uso. Il cron segnala il controllo
  dovuto; la ricerca semantica parte dal GPT su richiesta.
- Dati sanitari, legali, fiscali e finanziari restano supporto informativo.
- La completezza della dashboard e misurata rispetto a fonti, date e copertura,
  non rispetto a informazioni ancora non fornite.
