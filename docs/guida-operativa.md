# Guida operativa di Personal OS

Personal OS e composto da due accessi complementari:

- **Personal OS GPT** interpreta messaggi, fotografie e documenti e prepara
  proposte strutturate;
- **PWA privata** mostra dashboard, fonti, documenti, scadenze, storico e il
  confronto prima/dopo necessario per confermare o rifiutare una proposta.

La chat non e l'archivio ufficiale. Un dato entra nel sistema solo dopo la
conferma nella PWA oppure tramite un import riconciliato e autorizzato.

## Accessi

- PWA: `https://personal-os-private.YOUR-SUBDOMAIN.workers.dev`
- GPT: usare il collegamento privato salvato nella PWA o tra i GPT recenti di
  ChatGPT.

La PWA richiede Cloudflare Access, account autorizzato e MFA. Il GPT deve
rimanere `Solo io`, senza file personali nella Knowledge permanente.

Su iPhone si puo installare la PWA da Safari con **Condividi > Aggiungi alla
schermata Home**. Il GPT e raggiungibile dall'app ChatGPT; una nuova chat deve
comunque aprire il GPT dedicato, perche lo stato viene letto dalla PWA e non
dalla memoria della conversazione.

## Quale canale usare

Usare il GPT per:

- fatti espliciti e correzioni in linguaggio naturale;
- peso, pressione, sintomi e altre misure datate;
- foto di pasti, ricevute, bollette e documenti ordinari;
- richieste di analisi sullo stato gia confermato.

Usare la PWA per:

- confermare, rifiutare o confrontare una correzione;
- caricare referti, identita, estratti conto completi e certificazioni;
- sbloccare e scaricare originali cifrati;
- usare simulatori, consultare grafici, audit, fonti e qualita;
- creare e verificare backup.

Non inviare mai password, PIN, OTP, CVV, codici di recupero o chiavi. Per dati
molto sensibili preferire il caricamento cifrato dalla PWA.

## Flusso quotidiano

1. Scrivere al GPT il fatto con data, importo/unita e fonte disponibile.
2. Il GPT legge il solo contesto pertinente e cerca un eventuale valore
   precedente.
3. Il GPT crea una proposta idempotente e restituisce il link di revisione.
4. Nella PWA controllare dati estratti, fonte, stato probatorio e differenze.
5. Confermare o rifiutare. La dashboard si aggiorna sul dato canonico.

Operazioni in mesi diversi restano eventi distinti. Una correzione sostituisce
solo l'evento selezionato e conserva la versione precedente come `Superato`.

Esempi di input:

- "Il 10 settembre ho investito 300 euro nello strumento X."
- "Correggi il valore del mutuo del 31 agosto con quello dell'attestazione."
- "Oggi peso 73,2 kg, bilancia domestica, ore 07:15."
- "Questa bolletta copre giugno e luglio: estrai consumo, costo e scadenza."
- "Registra questa manutenzione e verifica la prossima scadenza dalla fonte
  ufficiale o dal manuale."

## Sezioni della PWA

- **Oggi**: stato sintetico, scadenze, qualita e massimo tre priorita
  informative.
- **Proposte**: elementi in attesa, confronto prima/dopo, conferma e rifiuto.
- **Patrimonio**: attivi, debiti, liquidita, flussi, portafoglio, rendimento,
  proiezioni e ISEE.
- **Salute**: profilo, HRV, metriche Apple Health, trend, sonno, peso,
  nutrizione, ECG, route e attivita osservate.
- **Casa e auto**: dati catastali, utenze, manutenzioni, garanzie, polizze,
  veicolo, costi e scadenze.
- **Bonus e regole**: cataloghi versionati e revisioni periodiche supportate da
  fonti ufficiali.
- **Scadenze**: date confermate, precisione, preavvisi e stato.
- **Documenti**: originali cifrati e metadati minimi.
- **Fonti e qualita**: provenienza, copertura, freschezza e conflitti.
- **Impostazioni**: privacy, servizi, Costituzione personale e backup.

## Salute e nutrizione

Il modulo accetta dati incrementali: Apple Health, Fascicolo Sanitario,
laboratorio, dispositivi e misure manuali possono essere aggiunti in momenti
diversi mantenendo fonte, unita, fuso orario e data originale.

Un nuovo export completo Apple Health o workbook e uno snapshot: quando viene
verificato sostituisce logicamente il precedente per evitare sovrapposizioni,
ma le righe vecchie restano storicizzate. Misure singole inviate al GPT restano
invece eventi incrementali indipendenti.

Sono disponibili:

- HRV Apple Health come **SDNN**, con segnale 7 giorni, baseline 60 giorni e
  rapporto tra le due; non viene trasformata in rMSSD;
- frequenza cardiaca, riposo, VO2max, ossigenazione, respirazione, temperatura,
  passi, energia, esercizio, stabilita e parametri di cammino/corsa;
- peso, altezza, BMI con conversioni di unita, misure corporee, pressione,
  glicemia, temperatura e altri valori manuali;
- sonno rilevato/valido, efficienza, core, profondo, REM, veglia e stato fonte;
- media, mediana, min/max, deviazione standard, pendenza osservata, medie mobili,
  finestre 28/90/365 giorni, confronto con i 90 giorni precedenti e copertura;
- riepiloghi ECG, percorsi e allenamenti osservati, senza prescrizioni o schede;
- diario nutrizionale per pasto e giorno, macro, fibre, sodio, calorie da macro,
  confidenza e incertezza delle stime fotografiche;
- BMI, metabolismo Mifflin-St Jeor, dispendio da energia attiva+basale quando la
  fonte e completa, e target nutrizionali derivati solo da ipotesi dichiarate.

Una foto non permette di conoscere esattamente peso, olio, salse o ingredienti
nascosti. Il GPT deve proporre intervalli e incertezza. Un referto resta dato
clinico da discutere con un professionista, non una diagnosi della PWA.

## Patrimonio e portafoglio

La dashboard usa l'ultima fotografia per conto, bene, debito o strumento e
segnala date non allineate. Include:

- patrimonio netto, attivi, debiti, liquidita e copertura della spesa;
- entrate, uscite, risparmio YTD, medie mobili a 12 mesi e categorie;
- andamento del patrimonio, variazione a 12 mesi, CAGR osservato e mesi
  migliore/peggiore;
- valore/costo/P&L per strumento, peso corrente, target, scostamento,
  concentrazione HHI e posizioni equivalenti;
- esposizione geografica ponderata sul valore di ciascun prodotto, con quota
  non classificata e sovra-allocazioni evidenziate;
- rendimento di periodo, annualizzato, volatilita, massimo drawdown e scarto
  benchmark su date comuni, solo da serie riconciliate separate dai flussi;
- scenari deterministici, simulazione Monte Carlo e autonomia del capitale con
  rendimento, volatilita, costi, inflazione e crescita dei versamenti visibili;
- simulazione ISEE ordinaria e speciale solo quando applicabile, con anno,
  nucleo, saldi/giacenze, immobili, mutui, esclusioni e scala tracciabili.

Simulazioni e proiezioni sono strumenti di sensibilita. Non sono previsioni,
consulenza finanziaria o attestazioni INPS/CAF.

## Casa, auto, bonus e scadenze

Per la casa si registrano identificativi catastali, quote, rendita, superficie,
contratti, bollette, consumi, costo unitario, conguagli, manutenzioni e garanzie.
Le bollette su piu mesi vengono ripartite per giorni di servizio senza sommare
unita incompatibili.

Ogni manutenzione puo collegarsi a una regola ufficiale o al manuale del bene.
Per caldaia, revisione auto, bollo, assicurazione, pneumatici e freni la PWA
distingue obbligo legale, intervallo del produttore e controllo per usura. Se
mancano Regione, alimentazione, potenza, chilometri o condizioni, mostra un dato
mancante invece di inventare una data.

Il veicolo separa prezzo di acquisto, valore residuo datato, svalutazione,
assicurazione, bollo, revisione, manutenzione, gomme, freni, batteria,
carburante/ricariche, parcheggi/pedaggi, interessi e straordinari. Mostra costo
totale, annuo, mensile e per chilometro quando le fonti sono sufficienti. I
rimborsi documentati riducono la categoria con segno negativo.

Il monitor bonus e regole conserva solo fonti ufficiali, territorio, requisiti,
validita, prossima revisione ed esito. Discussioni social possono suggerire un
tema, ma non dimostrano un diritto o una scadenza.

Il primo giorno del mese Cloudflare crea automaticamente le revisioni dovute e
le mostra nel brief. Senza un'API di modello a consumo, il Worker non interpreta
autonomamente il web: aprire il GPT e scrivere `Esegui i monitor dovuti`. Il GPT
ricerca le fonti ufficiali aggiornate, propone le nuove versioni e il monitor si
chiude solo dopo la conferma nella PWA.

## Documenti sensibili

La PWA cifra l'originale nel browser con AES-256-GCM prima dell'upload. La chiave
del file e avvolta con una chiave derivata dalla passphrase del vault; passphrase
e testo in chiaro non raggiungono Worker, D1 o R2.

Conservare la passphrase in un password manager. Se viene persa, gli originali
non sono recuperabili. Personal OS resta una copia operativa: mantenere anche un
archivio indipendente cifrato dei documenti essenziali.

Dopo aver confermato l'estrazione e archiviato l'originale, il file allegato a
ChatGPT puo essere cancellato dalla **Library** e poi dalla chat. Eliminare solo
la chat potrebbe non eliminare il file dalla Library. Le chat temporanee sono
preferibili per materiale particolarmente sensibile.

## Privacy e sicurezza

- Cloudflare Access controlla identita e MFA davanti a ogni route.
- Il Worker verifica nuovamente token, audience e identita.
- Il GPT usa un'identita di servizio revocabile e scope limitato.
- D1 non e accessibile dal browser; ogni query e vincolata al workspace.
- I campi altamente riservati hanno cifratura applicativa autenticata.
- Audit e versioni canoniche sono append-only.
- Nessuna chiave amministrativa e inclusa nel frontend.
- I log tecnici omettono corpi, documenti e valori personali.
- Lo switch **Privacy** maschera cifre, grafici, tabelle e campi compilati per
  mostrare l'interfaccia senza esporre valori; non cambia i dati salvati.

## Automazioni

Sono automatici: validazione, idempotenza, versionamento, audit, calcoli,
grafici, qualita, scadenze derivate da regole confermate, apertura mensile dei
monitor e backup cifrati. Estrazione, ricerca e interpretazione avvengono quando
si invia un messaggio o un documento al GPT.

Restano deliberatamente manuali: conferma dei dati sensibili, verifica di una
fonte ambigua, sblocco degli originali e decisioni mediche, fiscali, legali o
finanziarie. Google Calendar non e attivo nella release corrente.

## Backup e recupero

Il Worker crea backup D1 cifrati nel bucket R2 privato. La chiave di recupero
deve esistere fuori da GitHub e Cloudflare. Il ripristino viene provato in un
database locale usa-e-getta e confronta il numero di righe di ogni tabella.

Il piano gratuito non garantisce disponibilita perpetua, assenza futura di
costi o backup gestiti. Gli avvisi di consumo e una copia indipendente evitano
che l'app diventi l'unico punto di perdita.

## Risoluzione problemi

- **Failed to fetch / sessione scaduta**: premere **Accedi di nuovo**.
  La PWA rimuove il service worker registrato e riapre il login Cloudflare
  Access. Completare MFA e riaprire la PWA.
- **Pagina vecchia dopo un rilascio**: chiudere tutte le finestre della PWA,
  riaprire dal collegamento e usare la riconnessione sicura.
- **Proposta duplicata**: non reinviarla; riaprire la stessa proposta. La chiave
  idempotente impedisce una seconda registrazione.
- **Valori diversi tra chat e PWA**: la PWA canonica prevale. Cercare la fonte e
  creare una correzione versionata.
- **File non apribile**: verificare passphrase e metadati; non tentare reset del
  vault, perche renderebbe inutilizzabili le chiavi avvolte.

## Ordine per il primo popolamento

1. Profilo minimo, fuso orario, composizione del nucleo e preferenze.
2. Baseline finanziaria alla stessa data, riconciliata con fonti ufficiali.
3. Movimenti, investimenti, debiti, mutuo e patrimonio immobiliare.
4. Apple Health originale e confronto con eventuali workbook derivati.
5. Polizze, contratti, bollette, manutenzioni e scadenze.
6. ISEE/DSU, fascicolo sanitario e documenti sensibili tramite upload cifrato.
7. Nuovi dati quotidiani via GPT, sempre controllando le proposte.

L'elenco completo dei documenti utili e in `docs/data-sources.md`; formule e
limiti sono descritti in `docs/metodologia-indicatori.md`.
