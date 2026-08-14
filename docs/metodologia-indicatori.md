# Metodologia di formule e indicatori

Tutti gli aggregati monetari hanno EUR come valuta base. Una fonte in altra
valuta deve essere convertita in EUR con tasso, data e fonte documentati prima
della proposta; il contratto API rifiuta importi non convertiti per evitare
somme matematicamente prive di significato.

Verificata il 13 agosto 2026. Questo documento descrive cosa calcola la PWA,
quali dati usa e quando evita deliberatamente di mostrare un numero. Nessuna
dashboard puo essere completa in assoluto: e completa rispetto alle fonti
caricate, alla loro data e alle ipotesi dichiarate.

## Regole comuni

- Un valore assente resta assente: non diventa zero.
- Le versioni superate non entrano nei totali correnti.
- Una posizione finanziaria usa l'ultima fotografia per identificativo; due
  fotografie dello stesso strumento non vengono sommate.
- Misurato, dichiarato, stimato e pianificato restano stati distinti.
- Ogni confronto mostra periodo e numerosita. Un trend non prova una causa.
- Quando la risposta del dashboard e limitata, la PWA segnala quante righe sono
  state restituite rispetto al totale.

## Patrimonio e flussi

La somma delle posizioni nette e:

`attivi x quota di possesso - valore assoluto dei debiti`.

Un saldo conto negativo viene trattato come passivita e riduce la liquidita;
non viene trasformato in attivo applicando il valore assoluto. Le passivita
registrate come debito usano invece il valore assoluto per tollerare convenzioni
di segno diverse delle fonti.

La PWA segnala se le date delle posizioni non coincidono. Il rapporto debiti su
attivi e `debiti / attivi`; non viene mostrato se gli attivi sono zero. Il tasso
di risparmio YTD e `(entrate - spese) / entrate`; trasferimenti e regolazioni di
passivita non sono spese operative.

Se manca uno snapshot esplicito, il patrimonio corrente puo essere mostrato
come somma derivata dalle posizioni. Uno snapshot piu recente prevale; lo
storico non viene inventato a partire da posizioni con date disallineate.

Acquisti di strumenti e trasferimenti tra conti non sono consumi. Una rata di
debito separa interessi, quota capitale e movimento di liquidita; il saldo di
una carta gia composto da acquisti registrati non diventa una seconda spesa al
momento dell'addebito.

La copertura di liquidita usa i saldi `account_balance` correnti divisi per la
spesa mensile media degli ultimi sei mesi disponibili con spese registrate. Il
numero di mesi osservati e sempre esposto: con uno storico parziale il risultato
e soltanto orientativo.

Lo storico del patrimonio conserva l'ultima osservazione valida di ogni mese.
La variazione a 12 mesi richiede lo stesso mese dell'anno precedente; il CAGR
compare solo con almeno 365 giorni e valori iniziale/finale positivi. Il mese
migliore e peggiore e ordinato per variazione assoluta rispetto al mese
precedente, mostrando separatamente la percentuale. Le medie di entrate e spese
a 12 mesi usano solo mesi realmente presenti e ne dichiarano il numero.

## Portafoglio

Valore, costo e plus/minusvalenza sono separati. La plus/minusvalenza e
`valore di mercato - costo fiscale dichiarato`; non include automaticamente
dividendi, tasse o costi passati.

La concentrazione usa l'indice Herfindahl-Hirschman:

`HHI = somma(peso_i^2)` e `posizioni equivalenti = 1 / HHI`.

Un portafoglio 60/40 ha quindi circa 1,92 posizioni equivalenti, non due
posizioni ugualmente diversificate. La PWA mostra anche il peso della posizione
maggiore e lo scostamento in punti percentuali dal target.

Le esposizioni geografiche vengono ponderate per il valore corrente del singolo
prodotto. Pesi superiori al 100%, valori non classificati o copertura incompleta
sono segnalati; non vengono normalizzati silenziosamente.

Su una serie di rendimenti cumulativi gia riconciliata, il rendimento del
periodo visibile e `indice finale / indice iniziale - 1`. Il rendimento
annualizzato usa l'effettivo numero di giorni. Il massimo drawdown e la maggiore
perdita percentuale da un precedente massimo dell'indice. Questi indicatori non
vengono calcolati da semplici variazioni del valore di mercato.

La volatilita annualizzata usa log-rendimenti tra osservazioni e la durata
effettiva di ogni intervallo. Richiede almeno tre punti. Lo scarto dal benchmark
usa soltanto date presenti in entrambe le serie, cosi periodi diversi non
vengono confrontati come se fossero omogenei.

TWR e XIRR non sono inventati. Compaiono soltanto rendimenti periodici
riconciliati oppure, in futuro, quando saranno disponibili tutti i NAV, acquisti,
vendite, distribuzioni, commissioni, imposte e trasferimenti necessari.

## Proiezioni

Il rendimento annuo netto dei costi e:

`(1 + rendimento lordo) x (1 - costo annuo) - 1`.

Viene trasformato in tasso mensile equivalente; i versamenti avvengono a fine
mese. Inflazione e crescita dei versamenti usano anch'esse tassi mensili
equivalenti. Il valore reale e il nominale diviso per l'inflazione cumulata. I
versamenti reali scontano ogni rata alla data in cui viene effettuata.

Gli scenari deterministici usano rendimento base e uno scarto di due punti
percentuali. La simulazione statistica genera 1.000 percorsi riproducibili con
rendimenti lognormali, volatilita scelta e percentili 10, 50 e 90. Non modella
regimi di mercato, code estreme, fiscalita o sequenze macroeconomiche: e uno
strumento di sensibilita, non una previsione o garanzia.

L'autonomia del capitale applica mese per mese rendimento netto, inflazione,
spesa, reddito passivo ed eventuale reddito temporaneo. Confronta tre percorsi:
nessun reddito, solo reddito passivo e piano completo. Il primo mese in cui il
capitale raggiunge zero determina l'orizzonte di esaurimento. Gli anni di spesa
coperti e il capitale teorico di indipendenza usano una spesa annua esplicita o,
se assente, quella annualizzata dai mesi osservati; la fonte della spesa resta
visibile. Il tasso di prelievo e un'ipotesi, non una garanzia.

## ISEE

La stima segue la struttura `ISE = ISR + 20% x ISP` e
`ISEE = ISE / scala di equivalenza`.

Per conti e depositi usa la maggiore tra somma dei saldi e somma delle giacenze
medie. L'eccezione del saldo inferiore si applica soltanto se attivata e se gli
incrementi patrimoniali documentati coprono almeno la differenza. Titoli di
Stato, buoni fruttiferi e libretti postali eleggibili sono esclusi fino al limite
complessivo di 50.000 euro.

La modalita ordinaria mantiene la franchigia della prima casa prevista dal
regolamento generale. La modalita `prestazioni familiari/inclusione 2026` usa le
franchigie e maggiorazioni specifiche introdotte per le sole prestazioni
indicate dalla legge 2026. Le due modalita non sono intercambiabili. La scala
include 0,5 per ogni componente con disabilita e consente altre maggiorazioni
soltanto come input esplicito verificato.

Il simulatore non ricostruisce automaticamente tutti i quadri DSU, nuclei
particolari, ISEE corrente, universitario o sociosanitario. Il risultato
ufficiale resta l'attestazione INPS o CAF.

Fonti principali: [Portale unico ISEE INPS](https://www.inps.it/it/it/dettaglio-scheda.it.schede-servizio-strumento.schede-servizi.Portale-unico-ISEE.html),
[novita ISEE 2025](https://www.inps.it/it/it/inps-comunica/notizie/dettaglio-news-page.news.2025.04.isee-e-dsu-nuove-regole-dal-3-aprile-2025.html),
[criteri specifici 2026](https://www.inps.it/it/it/inps-comunica/atti/circolari-messaggi-e-normativa/dettaglio.circolari-e-messaggi.2026.01.messaggio-numero-102-del-12-01-2026_15133.html).

## Salute e nutrizione

Il BMI usa `kg / m^2` dopo conversione esplicita di kg/lb e m/cm/in. Unita
sconosciute o risultati non plausibili non producono un BMI.

Il metabolismo basale usa Mifflin-St Jeor solo con peso in kg, altezza in cm,
eta tra 14 e 120 anni e sesso biologico esplicitamente fornito per la costante:

- maschio: `10 x kg + 6,25 x cm - 5 x anni + 5`;
- femmina: `10 x kg + 6,25 x cm - 5 x anni - 161`.

Non viene stimato con dati incompleti. Il dispendio osservato da wearable e la
mediana, fino agli ultimi 90 giorni, della somma energia attiva + basale nei soli
giorni in cui entrambe esistono. La coppia di sorgenti con maggiore copertura e
preferita; sorgenti diverse restano dichiarate.

Per ogni metrica Apple Health la PWA usa una sorgente alla volta. Se esistono
iPhone, Watch o app diverse, l'utente sceglie la serie e non viene effettuata
una somma arbitraria. Quantita cumulative come passi, distanza ed energia usano
il totale giornaliero della sorgente; frequenze e indicatori fisiologici usano
la media; peso e altezza usano l'ultimo valore giornaliero.

Le statistiche sono media, mediana, minimo, massimo, deviazione standard della
popolazione e pendenza OLS riportata a 30 giorni. La media mobile usa una
finestra di sette giorni di calendario e mostra soltanto osservazioni presenti.
Non sostituiscono intervalli clinici, diagnosi o parere medico.

Per HRV Apple Health l'unita semantica e SDNN. La PWA calcola media 7 giorni,
baseline 60 giorni e rapporto `media7 / media60` sulla sorgente con piu giorni
validi nella finestra corrente, mostrando la numerosita di entrambe le finestre.
Uno storico lungo ma scaduto non prevale su una sorgente corrente. Non converte SDNN in
rMSSD e non riempie i giorni mancanti.

Per i pasti, le calorie da macronutrienti sono `4 x proteine + 4 x carboidrati
+ 9 x grassi`. Lo scarto rispetto alle calorie dichiarate e informativo:
fibre, alcol, polioli e arrotondamenti possono spiegarlo. Le incertezze kcal dei
singoli pasti vengono sommate linearmente, scelta prudente quando gli errori da
foto possono essere correlati. Foto e stime non diventano pesi esatti.

I target nutrizionali sono calcolati solo quando ogni ipotesi necessaria e
dichiarata. Il deficit e `TDEE x percentuale`, limitato tra minimo e massimo, e
le calorie risultanti sono arrotondate a 25 kcal. Proteine e grassi sono
`peso x grammi/kg`, arrotondati a 5 g; i carboidrati sono le calorie residue
dopo `4 kcal/g` per proteine e `9 kcal/g` per grassi. La variazione teorica di
peso usa `deficit settimanale / energia dichiarata per kg` e resta una stima.
Il target passi parte dalla mediana recente, aggiunge l'incremento dichiarato,
arrotonda verso l'alto e applica minimo/massimo. Nessuna di queste formule e una
prescrizione clinica.

## Casa e utenze

Una bolletta che copre piu mesi viene ripartita in proporzione ai giorni di
servizio inclusivi di inizio e fine. Il costo unitario e `totale bollette /
consumo` e include anche quote fisse, imposte e conguagli: per questo viene
mostrato separatamente per servizio e unita.

Conguagli a credito, rimborsi e fatture negative conservano il segno e riducono
il costo netto. Il credito deve essere esplicito nella fonte: una bolletta
ordinaria non viene resa negativa per inferenza.

Non vengono confrontati kWh, Smc, metri cubi o GB tra loro. Normalizzazione per
gradi-giorno, superficie o numero di occupanti richiede dati aggiuntivi e non e
attualmente calcolata.

## Auto

Il costo totale di proprieta e:

`prezzo di acquisto - valore residuo + costi registrati + costo opportunita`.

Il costo opportunita e una stima semplice sul capitale medio immobilizzato:
`(prezzo + residuo) / 2 x tasso annuo x anni`. Se il tasso non e indicato vale
zero. Costo annuo, mensile e per km non compaiono senza data di acquisto valida,
quotazione residua e percorrenza necessaria.

I costi operativi sono raggruppati per anno in fissi, energia, manutenzione,
finanziamento, uso e altro. La svalutazione resta separata per evitare doppi
conteggi. Quotazioni, obblighi e intervalli del costruttore devono essere datati
e documentati; la PWA non effettua scraping di listini.

Rimborsi e indennizzi auto conservano segno negativo e riducono la relativa
categoria soltanto quando la fonte li documenta; non vengono dedotti per
inferenza.

## Qualita e copertura

Per ogni area l'indice assegna 45 punti alla presenza di dati, 25 a una fonte
verificata quando richiesta e 30 alla freschezza. Una fonte scaduta mantiene
solo 5 punti di freschezza e lo stato viene indicato come `stale`. Documenti in
staging o rifiutati non aumentano la copertura.

L'indice misura disponibilita, provenienza e aggiornamento; non certifica che
ogni dato sia vero o che ogni possibile voce sia presente.

## Informazioni utili ancora acquisibili

- NAV e flussi completi per TWR/XIRR, dividendi netti, commissioni e fiscalita;
- spese essenziali/non essenziali e budget per una copertura di emergenza piu
  precisa;
- piano mutuo con quota capitale/interessi per costo del debito e scadenza;
- letture contatore, superficie, occupanti e gradi-giorno per consumi normalizzati;
- data, km e documento di ogni manutenzione auto per costo per anno e km;
- intervalli del laboratorio e storico omogeneo per trend clinici controllabili;
- ricette, pesi e porzioni per ridurre l'incertezza nutrizionale;
- attestazioni ISEE/DSU per confrontare stima, risultato ufficiale e anno dati.

Queste sono estensioni dei dati, non motivi per riempire campi con stime. La PWA
mostra una sezione vuota finche non esiste una fonte sufficiente.
