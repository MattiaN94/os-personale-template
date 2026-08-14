# Fonti per popolare Personal OS

Personal OS deve partire da fonti originali e riconciliate, non dai valori
stimati nelle chat precedenti. Ogni dato conserva ente emittente, periodo,
data di acquisizione, hash del file, stato probatorio e stato della versione.

## Regole di consegna

Fornire il formato nativo strutturato quando esiste (`CSV`, `XML`, `JSON`) e il
PDF ufficiale come prova leggibile. Un file deve avere un periodo chiaro. Per
una fotografia corrente servono anche il saldo iniziale del periodo e i
movimenti che spiegano il saldo finale.

Non inviare mai password, PIN, OTP, CVV, codici di recupero, seed phrase, chiavi
private o fotografie complete di carte. Oscurare il numero carta; per IBAN e
conto bastano banca, intestatario e ultime quattro cifre salvo necessità legale.

## Patrimonio e flussi finanziari

1. **Conti correnti e deposito**: estratti ufficiali `CSV` e PDF dal 1 gennaio
   2026 a oggi, con saldo iniziale/finale, valuta e movimenti. Includere contanti
   soltanto come saldo manuale datato.
2. **Carte di credito**: estratti mensili con operazioni, rimborsi, saldo da
   addebitare, data di addebito e distinzione tra contabilizzato e pendente.
3. **Broker e investimenti**: situazione posizioni e liquidita, lista movimenti,
   acquisti/vendite/dividendi/commissioni, quantita, ISIN o ticker e prezzo di
   carico. Gli eseguiti servono a ricostruire ogni PAC come evento mensile
   indipendente.
4. **Previdenza e gestioni**: estratti di fondi pensione e gestioni, contributi,
   quote, valore corrente, costi e beneficiari.
5. **Mutuo e prestiti**: attestazione ufficiale del residuo, piano di
   ammortamento aggiornato, tasso, rata, quota capitale/interessi, scadenza,
   prossima rata e conto di addebito. Le stime precedenti restano non canoniche.
6. **Casa e altri beni**: atto o visura con quota di proprieta, prezzo/costo,
   data, eventuali debiti collegati. Una valutazione di mercato deve indicare
   fonte e data e restare separata dal valore documentale.
7. **Redditi**: buste paga, CU, dichiarazione, rimborsi e altre entrate. Per
   analisi mensile basta un export con netto, data e categoria; i documenti
   fiscali completi possono restare cifrati.
8. **Debiti e crediti**: finanziamenti, rateizzazioni, prestiti personali,
   somme dovute o da ricevere, controparte, residuo, tasso e scadenze.
9. **Baseline di riconciliazione**: per ogni conto indicare un'unica data di
   fotografia comune. Somma dei saldi, posizioni e debiti deve coincidere con le
   fonti di quel giorno prima di calcolare il patrimonio netto.

## Salute

1. **Apple Salute**: esportazione originale ZIP da iPhone, contenente XML e
   metadati. Conservare dispositivo, app sorgente e fuso orario per evitare
   doppi conteggi tra iPhone, Apple Watch e app terze.
2. **Fascicolo Sanitario Elettronico**: indice/esportazione disponibile e PDF
   originali di referti, laboratorio, lettere di dimissione, vaccinazioni,
   prescrizioni e prestazioni. Importare risultati con unita e intervalli di
   riferimento del laboratorio, mai come numeri isolati.
3. **Terapie e condizioni attuali**: farmaco, dose, frequenza, prescrittore,
   inizio/fine; allergie e diagnosi solo da fonte medica o dichiarazione
   esplicita, marcandone l'origine.
4. **Misure manuali**: peso, circonferenze, pressione, temperatura, sintomi e
   pasti con data/ora, unita, dispositivo e condizioni di misurazione.
5. **Appuntamenti e prevenzione**: visite, controlli, screening, richiami,
   prescrizioni in scadenza e medico/struttura.
6. **Contatti utili**: medico di base, specialisti, farmacia ed eventuale
   contatto di emergenza, soltanto con i dati minimi utili.

Un eventuale workbook di monitoraggio e il relativo import locale sono fonti
derivate. Prima dell'importazione canonica vanno confrontati almeno
totali, date estreme, unita, duplicati per sorgente e alcune giornate campione
con l'export Apple originale.

Per il diario nutrizionale si puo inviare al GPT una foto con data/ora, tipo di
pasto e, quando possibile, ingredienti o quantita note. Una fotografia non rende
misurabili olio, salse, ripieni o peso: calorie e macro restano stime con livello
di confidenza e intervallo di incertezza. Sono utili etichetta nutrizionale,
ricetta, peso della confezione e porzione consumata. Il modulo non contiene una
scheda di allenamento; conserva soltanto attivita osservate provenienti dalle
fonti salute.

## Casa, bollette e contratti

- Visura catastale aggiornata: Comune e codice catastale, sezione, foglio,
  particella, subalterno, zona, categoria, classe, consistenza, superficie,
  rendita, intestazione/diritto e quota. Aggiungere atto di acquisto, APE e dati
  impianti solo se utili; gli originali restano cifrati.
- Ultime 12-24 bollette per energia, gas, acqua, internet, telefono e rifiuti,
  preferibilmente PDF piu CSV se disponibile.
- Conservare anche note di credito e conguagli negativi: il segno viene
  mantenuto e riduce il costo netto soltanto quando e esplicito nella fonte.
- Contratto/offerta corrente: fornitore, POD/PDR mascherato, tariffa, costi
  fissi, rinnovo, recesso e metodo di pagamento.
- Letture contatore, consumi, conguagli, scadenza e stato pagato/addebito.
- Condominio, manutenzione, imposte casa, garanzie di elettrodomestici e lavori.
- Abbonamenti ricorrenti con importo, frequenza, prossimo rinnovo e modalita di
  cancellazione.
- Per ogni manutenzione: bene, intervento, data, tecnico, documento, istruzione
  del costruttore o regola applicabile e prossima verifica esatta se nota. Per la
  caldaia servono Regione, combustibile, potenza e libretto/rapporto: non esiste
  una periodicita universale valida per ogni impianto.

## Assicurazioni e protezioni

Per casa, vita, salute, auto, responsabilita e altre polizze fornire contratto e
quietanza corrente: compagnia, numero mascherato, premio, frequenza, coperture,
massimali, franchigie, esclusioni principali, beneficiari, rinnovo e termine di
disdetta. Aggiungere sinistri aperti e documenti richiesti, se presenti.

## Amministrazione, identita e lavoro

- **Documenti personali**: per carta d'identita, patente, passaporto e tessere
  registrare soltanto tipo, ente, data di rilascio e scadenza. Archiviare la
  scansione completa solo se davvero utile e sempre cifrata nella PWA.
- **Fisco e previdenza**: CU, 730/Redditi, ricevute di invio, F24, ISEE/DSU,
  attestazioni di giacenza media, posizione INPS e quietanze. Ogni documento
  deve mantenere anno fiscale e soggetto emittente; una giacenza ISEE non e un
  duplicato di un estratto conto anche quando banca, anno o titolo coincidono.
- **Simulazione ISEE**: nucleo e residenza, anno di riferimento, redditi e
  detrazioni, canone di locazione, saldi al 31 dicembre, giacenze medie, altri
  patrimoni mobiliari, titoli eventualmente esclusi, valori IMU, quote di
  possesso e mutui residui. La stima PWA non sostituisce l'attestazione INPS.
- **Lavoro**: contratto e variazioni, buste paga, premi, welfare, ferie/permessi,
  TFR, formazione obbligatoria e relative scadenze. Per la dashboard finanziaria
  estrarre soltanto netto, data valuta e componenti utili all'analisi.
- **Veicoli e mobilita**: libretto, prima immatricolazione, data e prezzo di
  acquisto, alimentazione, classe Euro, Regione bollo, chilometraggio iniziale e
  attuale, finanziamento e garanzie, con targa e identificativi mascherati.
  Fornire inoltre RC Auto, bollo, revisioni, tagliandi, pneumatici, freni,
  batteria, lavaggi/parcheggi/pedaggi, carburante o ricariche e manutenzione
  straordinaria. Per il valore residuo usare una quotazione Quattroruote o altra
  fonte documentata con data; il sistema non effettua scraping del listino.
- **Pratiche e rimborsi**: protocollo, ente, data di invio, stato, importo,
  documenti mancanti, scadenza e data prevista di incasso o risposta.

## Acquisti, viaggi e progetti personali

- Acquisti rilevanti, ricevute, garanzie, finestre di reso e rate residue.
- Viaggi ed eventi: prenotazioni, scadenze di cancellazione, assicurazioni,
  pagamenti effettuati e budget residuo; non archiviare dati di altre persone
  oltre quanto necessario.
- Lavori e progetti personali: budget, fornitori, preventivi, pagamenti,
  documenti e prossime decisioni, mantenendo separati preventivo e consuntivo.

## Scadenze ed eventi

- Rate, bollette, imposte, documenti personali e certificazioni in scadenza.
- Rinnovi e finestre di disdetta di polizze, contratti e abbonamenti.
- Visite, richiami, prescrizioni, manutenzioni e revisioni.
- Eventi familiari, viaggi e spese previste rilevanti.
- Garanzie, resi, bonus, rimborsi e crediti da incassare.

Per ogni scadenza indicare titolo, data/ora o precisione della data, importo se
applicabile, stato, responsabile, link al documento e giorni di preavviso. Nella
release corrente restano nella PWA; l'eventuale sincronizzazione Google Calendar
è un'estensione separata e disattivata.

## Profilo e check-in

- **Costituzione personale**: ambito individuale, priorità, tono preferito,
  soglie operative, finestre dei promemoria e operazioni vietate. Non richiede
  documenti identificativi e viene aggiornata per versione.
- **Check-in soggettivi**: energia, umore e stress da 1 a 5, sintomi o nota
  breve. Restano dichiarazioni personali, distinte dai dati dei dispositivi.

La composizione del nucleo deve essere dichiarata e versionata. Non inferire
persone, relazioni o maggiorazioni da esempi, allegati o conversazioni passate.

## Canale di consegna

- Usare il GPT per fatti espliciti, fotografie, bollette e documenti ordinari:
  il risultato arriva sempre come proposta da controllare nella PWA.
- Usare la PWA o il link protetto per referti, identita, estratti completi e
  certificazioni: l'originale viene cifrato prima di lasciare il dispositivo.
- Per esportazioni voluminose usare il formato nativo e conservarle fuori dalle
  chat. Apple Salute e workbook vengono caricati dalla sezione **Fonti dati**
  soltanto dopo il controllo locale.
- Non classificare mai come duplicati due file solo per titolo, data o nome:
  servono hash identico oppure confronto documentale e periodo coerenti.

## Ordine di importazione consigliato

1. Identità minima, fuso orario, preferenze e Costituzione.
2. Baseline finanziaria ufficiale alla stessa data e riconciliazione dei totali.
3. Movimenti, investimenti e PAC, poi debiti e patrimonio immobiliare.
4. Apple Salute originale e confronto con l'eventuale workbook derivato.
5. Contratti, assicurazioni, bollette e abbonamenti.
6. Scadenze future nella PWA.
7. Fascicolo Sanitario e documenti clinici originali, quando utili.
8. Foto dei pasti e nuovi dati sanitari via GPT, uno alla volta e sempre con
   conferma.

La PWA rimane una copia operativa. Estratti, referti, contratti e documenti
essenziali devono conservare anche una copia indipendente e cifrata.

## Fonti normative e metodologiche integrate

Verificate il 13 agosto 2026. Il cron mensile apre la revisione; quando si
richiama il GPT, questo deve ricontrollare le fonti e proporre una nuova versione
se sono cambiate.

- Revisione veicoli: [Portale dell'Automobilista](https://www.ilportaledellautomobilista.it/web/portale-automobilista/veicoli/revisioni).
- RC Auto e quindici giorni successivi alla scadenza:
  [IVASS](https://www.ivass.it/consumatori/quesiti/r.c.auto/index.html).
- Bollo e superbollo regionali: [ACI](https://aci.gov.it/servizio/calcola-online-il-bollo-ed-il-superbollo/).
- Costi chilometrici di esercizio: [ACI](https://aci.gov.it/servizio/costi-chilometrici-di-esercizio/).
- Promemoria veicolo: [ACI Memo](https://aci.gov.it/servizio/memo/).
- Dotazioni invernali e ordinanze locali:
  [Polizia di Stato](https://questure.poliziadistato.it/Alessandria/articolo/28576554a3b113cbd098612641).
- Impianti termici: [DPR 74/2013, Gazzetta Ufficiale](https://www.gazzettaufficiale.it/eli/gu/2013/06/27/149/sg/pdf).
- ISEE e DSU: [Portale unico INPS](https://www.inps.it/it/it/dettaglio-scheda.it.schede-servizio-strumento.schede-servizi.Portale-unico-ISEE.html)
  e [simulatore INPS](https://servizi2.inps.it/servizi/Iseeriforma/FrmSimHome.aspx).
- Bonus sociali: [ARERA](https://www.arera.it/consumatori/bonus-sociale/bonus-sociale-per-disagio-economico/quali-sono-i-requisiti).
- Detrazioni edilizie: [Agenzia delle Entrate](https://infoprecompilata.agenziaentrate.gov.it/portale/semplificata-mod-oneri-immobili).
- Comunicazioni per bonus energetici: [ENEA](https://bonusfiscali.enea.it/).
- Infrastrutture di ricarica: [MIMIT, DPCM Automotive 2026](https://www.mimit.gov.it/images/stories/normativa/allegati/DPCM_Automotive_2026-nf.pdf).
- Identificativi catastali: [Agenzia delle Entrate](https://assistenzaipocat.agenziaentrate.gov.it/homeCittadino.asp).
- Metodo di quotazione auto: [Quattroruote](https://www.quattroruote.it/guide/quotazioni-auto/come-funziona-la-quotazione-auto-su-quattroruote.html).

Discussioni Reddit sono state usate soltanto per individuare voci spesso
dimenticate, come accantonamenti annuali per bollo, tagliando, gomme, batteria e
revisione: [dashboard patrimonio](https://www.reddit.com/r/ItaliaPersonalFinance/comments/1baiiwj),
[costi ricorrenti](https://www.reddit.com/r/ItaliaPersonalFinance/comments/1hw0ymn),
[manutenzione auto](https://www.reddit.com/r/ItalyMotori/comments/1ssfh4m) e
[intervalli di sostituzione](https://www.reddit.com/r/ItalyMotori/comments/1smywqj).
Reddit non viene mai usato per stabilire legge, scadenza o diritto a un bonus.
