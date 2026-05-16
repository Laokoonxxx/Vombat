# Vombat & Co. — Inženýři krychlí

*Pravidla digitální verze*

Tahová desková hra pro 2–4 hráče. Vombati žvýkají eukalyptus, vyformovávají kostkové bobky (skutečná biologie!) a chystají se rozmačkat Tasmánského Čerta. Tento dokument je úplné znění pravidel pro digitální adaptaci. Zahrnuje původní pravidla z `Pravidla hry.docx` doplněná o rozhodnutí učiněná při návrhu digitální verze.

> **MVP poznámka:** Aktuální digitální verze podporuje pouze **2 hráče** lokálně (hot-seat) a pouze jeden vítězný cíl **Rozmačkej Tasmánského Čerta**. Pravidla pro 3–4 hráče a ostatní cíle jsou v dokumentu zachována pro pozdější rozšíření.

---

## 1. Komponenty a slovník

### Hexagonální mapa
Mapa se skládá z **dílků**. Každý dílek má 7 hexů: 1 centrální hex + 6 hexů kolem něj.

Středový hex dílku je vždy buď:
- 🌳 **modrý** (Eukalyptový strom), nebo
- 👹 **černý** (Tasmánský Čert)

6 okolních hexů má jeden z těchto typů:
| Symbol | Typ | Barva | Aktivace (hod) |
|---|---|---|---|
| 🟫 | Hlína | oranžová | 2–4 |
| 🌱 | Záhon | šedá | 4–6 |
| 🏜️ | Poušť | písková | 7+ |
| 🌵 | Houští | zelená | 5–9 (pohyb), 5+/7+/9+ (využití) |
| 🐱 | Kočka | hnědá | 11–14 (rozmačkání) |

Středové hexy se aktivují takto:
| Symbol | Typ | Barva | Aktivace |
|---|---|---|---|
| 🌳 | Eukalyptový strom | modrá | 7–8 |
| 👹 | Tasmánský Čert | černá | 12+ (pohyb) |

### Počet dílků dle počtu hráčů
| Hráči | Dílků celkem | Modrých 🌳 | Černých 👹 |
|---|---|---|---|
| 2 | 7 | 5 | 2 |
| 3 | 10 | 6 | 4 |
| 4 | 13 | 7 | 6 |

### Skládání mapy
Dílky se skládají do "květiny" — pro 7 dílků je 1 střední dílek a 6 dílků kolem něj. Dílky se dotýkají hranami; mezi sousedními dílky není žádná mezera.

Konkrétní vnitřní rozložení každého dílku je dáno **předprogramovanou sadou šablon**. Při startu hry se náhodně vybere odpovídající počet modrých a černých šablon a každá se náhodně otočí.

### Žetony a předměty
- **Vombat** — figurka hráče. Každý hráč začíná s 1 Vombatem, druhého lze koupit v setupu za 5 brambor.
- **Bobek 💩** — žeton, kterým hráč označuje pole, na kterém provedl akci kromě "Zasaď".
- **Mrkev 🥕** — žeton, kterým hráč označuje pole, na kterém provedl "Zasaď".
- **Brambora 🥔** — měna a obranný prostředek. Hráč začíná hry s tím, co mu zbylo po nákupu (z výchozích 10 brambor).
- **Kostky** — k2, k4, k6, k8, k10, k12, k20. Hráč má **Ruku** (kostky, kterými se hází) a **Zásobu** (rezerva).

### Hexy se zelenými kostkami
V Houští se generují kostky v poměru **2 : 2 : 1** pro k4 : k6 : k8. Tyto kostky lze získat akcí na Houští (viz § 6).

### Tunely
Tunelem jsou:
- **Všechna černá pole** (Čert žije v podzemí a vede tam několik tunelů).
- **Pole bývalé Kočky** po jejím rozmačkání.

Pohyb skrz tunel viz § 5.

---

## 2. Příprava hry

1. **Slož desku** podle počtu hráčů (viz tabulka v § 1). Mapa se generuje automaticky.
2. Houště se obsadí kostkami k4/k6/k8 v poměru 2 : 2 : 1.
3. Hnědá pole obsadí Kočky.
4. **Každý hráč si vezme:** desku hráče, 2 Vombaty své barvy (druhý Vombat se umístí na hrací plán až po koupi v setupu), a 20 žetonů své barvy.
5. **Začínající hráč** se vylosuje náhodně.
6. **Výběr startovní pozice** — postupně každý hráč vybere libovolné pole na mapě a umístí na něj svého prvního Vombata. Nelze začít na poli Kočky ani Čerta.
   > Tip: Pole sousedící s Kočkou nejsou úplně bezpečná.
7. **Nákup startovního vybavení** — každý hráč dostane 10 brambor a *musí* si koupit alespoň 1 kostku. Zbylé brambory si ponechá do hry.

### Ceník startovního nákupu
| Předmět | Cena |
|---|---|
| 1k2 | 5 🥔 |
| 1k4 | 7 🥔 |
| 1k6 | 9 🥔 |
| 1k8 | 10 🥔 |
| 1k10 | 10 🥔 |
| 1k12 | 12 🥔 |
| 2. Vombat (na stejné pole jako 1.) | 5 🥔 |

> 1k20 nelze koupit. Lze ji pouze získat (Vyformovat s vysokým skóre, Bylinkový elixír, 1. místo ve formaci).

---

## 3. Cíl hry

Hráči se střídají v tazích, dokud některý hráč nedosáhne cíle. Hra nemá pevně daný počet tahů.

### Vítězné cíle
1. **Rozmačkej Tasmánského Čerta** — porazit Čerta v boji (viz § 9). **(MVP — pouze tento cíl je aktivní v digitální verzi.)**
2. **Ovládej v jednu chvíli 4 Eukalyptové stromy** (modrá pole).
3. **Ovládej v jednu chvíli 3 Eukalyptové stromy a 7 záhonů mrkve** (šedá pole + oranžová pole, na kterých bylo zasazeno).

> Pro první hry doporučujeme hrát pouze cíl 1.

---

## 4. Tah hráče

Pokud Vombat hráče **nestojí na** ani **nesousedí s** černým polem (Čertem), tah vždy začíná **hodem všemi kostkami v Ruce**.

Pokud Vombat sousedí/stojí na černém poli, hráč se může **před hodem** rozhodnout, že bude bojovat s Čertem (viz § 9).

### Standardní tah
1. **(Pouze s Tříděním)** Můžeš až 3× zdarma přesunout kostku Ruka ↔ Zásoba — naladíš si tvar Ruky podle příležitostí, které vidíš.
2. Hoď všemi kostkami v Ruce.
3. Sečti hodnoty všech kostek.
4. **Zkontroluj Kočku** — pokud Vombat sousedí s živou Kočkou a součet hodu je nižší než 5, musíš odevzdat 🥔 bramboru nebo 1 kostku (viz § 7).
5. Vyber jednu z akcí:
   - **Pohyb** (§ 5)
   - **Využití pole** (§ 6)
   - **Spánek** (§ 8)

### Alternativy
- Pokud nechceš nebo nemůžeš využít hod, můžeš si po hodu zvolit **Spánek** (§ 8).
- Pokud máš dovednost **Sprint** (§ 6.7), můžeš v jednom tahu provést **Pohyb + Využití pole** (na stejné cílové pole).

### Třídění před hodem (deck-building knob)
S dovedností **Třídění** (§ 6.7) si na začátku každého tahu — ještě před hozením kostek — můžeš až **3× zdarma** přesunout kostku mezi Rukou a Zásobou. To je hlavní mechanika aktivního deck-buildingu: vidíš, která sousední pole chceš aktivovat, a stáhneš si do Ruky kostky, které k tomu pasují. Po hodu už tato volba není (kostky které hodíš, jdou na stůl).

---

## 5. Pohyb

Posuň jednoho svého Vombata na **sousední neobsazené pole**, jehož **aktivační rozsah** odpovídá tvému součtu hodu.

### Aktivační rozsah pro pohyb
| Pole | Rozsah |
|---|---|
| Hlína | 2–4 |
| Záhon | 4–6 |
| Poušť | 7+ |
| Eukalyptus | 7–8 |
| Houští | 5–9 |
| Kočka | 11–14 (= rozmačkání, viz níže) |
| Čert | 12+ |

### Omezení pohybu
- Nelze vstoupit na pole obsazené **jiným Vombatem**.
- Nelze vstoupit na pole se **živou Kočkou** (kromě případu rozmačkání 11–14).
- Nelze vstoupit na **zelené pole** (Houští), na kterém leží kostka. (Lze jej obsadit, pokud na poli leží žeton soupeře/tvůj — pole bylo už použito.)
- **Lze** vstupovat na černé, šedé nebo oranžové pole, na kterém leží žeton kostky soupeře (Obrana).

### Tunel
Pokud Vombat **stojí na poli s tunelem** nebo **sousedí s polem s tunelem**, může si **místo vstupu na sousední pole** zvolit pohyb na libovolné jiné pole s tunelem na mapě. (Hodnota hodu pro tento "teleport" se neuplatňuje.)

Tunely jsou: **všechna černá pole** + **pole bývalé Kočky** (po rozmačkání).

### Rozdrcení Kočky (zadkem o stěnu nory)
Hod 11–14 + sousední Kočka → Vombat zaláká kočku do své nory a chrupavčitě zpevněným zadkem ji rozdrtí o strop. Kočka je odstraněna, hráč získá **1k8**, pole se mění na **tunel**.

> 🔬 **Vědecký fakt:** Vombati skutečně mají osmifolovou strukturu kostí v zadní části (tzv. „armored bum"), kterou zatahují vchody do nor a dokážou s ní zabít predátora. Mechanika v této hře je biologicky autentická.

🎁 **Milestone bonus:** Pokud je tohle tvoje **první rozdrcená Kočka** ve hře, automaticky získáš dovednost **Lázně** zdarma (i bez Eukalyptů).

### Konec tahu při pohybu
Posunutí Vombata **ukončí tvůj tah** (kromě případu Sprintu, viz § 6.7).

---

## 6. Využití pole

Můžeš využít pole, na kterém **stojí** některý tvůj Vombat nebo se kterým tvůj Vombat **sousedí**, a které ještě nebylo dříve využito (kromě případů uvedených u jednotlivých polí).

Hodnota hodu musí spadat do aktivačního rozsahu pole.

Vždy, když využiješ pole, **označíš ho svým Bobkem nebo Mrkví** (dle akce). Pole je tím "obsazené".

### 6.1. Hlína 🟫 (oranžová, aktivace 2–4)
Hráč vybere jednu z následujících akcí:

#### Zasaď 🥕
Polož na Hlínu svůj žeton **Mrkve**. Posuň svůj ukazatel Mrkve na společné desce o 1 pole.
> Pozor: Pokud později soupeř využije tuto Hlínu, může tvoji Mrkev odstranit a využít Hlínu pro jinou akci. Tvůj ukazatel Mrkve se mu sníží o 1. Vlastní Mrkev odstranit nemůžeš.

#### Vyformuj kostku 💩
Vombat má kostkové fekálie (skutečná biologie!). Polož na Hlínu svůj **žeton** a vyformuj kostku, jejíž maximální hodnotu určuje vzorec:
```
score = počet polí Mrkve (tvůj ukazatel)
      + počet brambor, které do akce investuješ (odhodíš)
      + počet polí sousedících s touto Hlínou, jež jsou obsazeny značkou SOUPEŘE
```

> 💡 **Sousední soupeřovy značky** (nikoli tvoje vlastní) zvyšují skóre.
> Záměr: pobízí agresivní hru — Vyformuj kostku poblíž soupeře vyplatí víc.

| score | Zisk |
|---|---|
| 0 | nic |
| 1 | 1k2 |
| 2 | 1k4 |
| 3 | 1k6 |
| 4 | 1k8 |
| 5 | 1k10 |
| 6–7 | 1k12 |
| 8+ | 1k20 |

#### Uč se 🧠
Polož na Hlínu svůj žeton **Bobku**. Získej dovednost (viz § 6.7).

Učení vyžaduje kontrolu nad určitým počtem **Eukalyptových stromů** (modrá pole). Jeden potřebovaný strom lze nahradit:
- odhozením libovolné kostky z Ruky nebo Zásoby, nebo
- zaplacením 3 brambor.

Každou dovednost lze naučit pouze 1×.

---

### 6.2. Záhon 🌱 (šedá, aktivace 4–6)
Záhony slouží jako "katalyzátor" pro Hlínu (zvyšují skóre Vyformování). Jediná akce:

#### Zasaď 🥕
Polož na Záhon žeton Mrkve. Ukazatel Mrkve +1.

#### Převzetí soupeři
Pokud má soupeř na Záhoně svoji Mrkev, můžeš ji odstranit:
- Pokud soupeř Záhon **nechrání kostkou** (Obrana, viz níže), prostě umístíš svou Mrkev. Soupeřův ukazatel Mrkve −1.
- Pokud soupeř Záhon **chrání kostkou**, musíš na Záhoně nechat **větší kostku** než tu, kterou je nyní chráněn. Soupeřova kostka se mu vrátí (do Ruky nebo Zásoby — jeho volba).

#### Obrana
Ihned po akci "Zasaď" se můžeš rozhodnout, že na Záhoně necháš některou svoji kostku z Ruky nebo Zásoby. Kostka zde zůstává do konce hry nebo do okamžiku, kdy ji někdo přebere.

> **MVP poznámka:** Obrana kostkou je v digitální verzi zjednodušena — takeover lze provést bez ověření vyšší kostky. Plné enforcement plánováno v další iteraci.

---

### 6.3. Eukalyptový Strom 🌳 (modrá, aktivace 7–8)
Eukalyptové stromy slouží jako "kapitál vědění" pro učení dovedností. Akce:

#### Obsaď 💩 (vždy možné)
Polož na Eukalyptus žeton Bobku. Ukazatel Bobku +1.

#### Obsaď + Uč se 🌳🧠 (volitelné, 1× za hru)
Místo standardního Obsaď můžeš ve stejném tahu **i hned naučit dovednost**.
- Strom se obsadí jako obvykle (+1 ukazatel stromů).
- Bezprostředně pak vybereš dovednost (jako akce **Uč se** na Hlíně).
- Strom který si právě obsadil **se počítá do požadovaných stromů**.

⚠️ **Omezení 1× za hru:** Hráč může využít akci „Obsaď + Uč se" pouze **jednou za celou hru** (nezáleží zda potom soupeř strom přebere — omezení zůstává).

**Převzetí soupeři** a **Obrana** fungují identicky jako u Záhonu.

---

### 6.4. Ostnaté Houští 🌵 (zelená)
Houští nabízí možnost získat kostku, která na něm leží (k4/k6/k8). Aktivační rozsah pro **využití** závisí na hodnotě kostky:

| Kostka na Houští | Požadavek |
|---|---|
| 1k4 | hod 5+ |
| 1k6 | hod 7+ |
| 1k8 | hod 9+ |

Akce:
1. Hoď a dosáhni požadované hodnoty.
2. Přidej kostku do své Ruky nebo Zásoby.
3. Označ Houští svým Bobkem.

Aktivační rozsah pro **pohyb** přes Houští (pokud na poli žádná kostka neleží — tj. už bylo využito) je 5–9.

---

### 6.5. Poušť 🏜️ (písková, aktivace 7+)
Poušť **nelze využít**, dokud nezískáš dovednost **Lázně** (§ 6.7). Po jejím získání ji můžeš využít stejně jako Hlínu (Zasaď / Vyformuj / Uč se), s tím rozdílem, že stále potřebuješ hod 7+.

---

### 6.6. Kočka 🐱 (hnědá)
Kočka není "pole k využití". Existují pouze dvě interakce:

- **Útok Kočky** — pokud Vombat sousedí s živou Kočkou a hod < 5, hráč musí odevzdat bramboru/kostku (viz § 7).
- **Rozmačkání** — hod 11–14, viz § 5.

---

### 6.7. Dovednosti (Uč se)
Každou lze získat pouze 1×. Vyžaduje akci **Uč se** na Hlíně (nebo Poušti s Koupelí).

| Dovednost | 🌳 | Účinek |
|---|---|---|
| **Kapacita** | 1 | Ruší oba limity: max 2 kostky stejného lvl v Ruce **i** max 3 kostky v Zásobě. |
| **Lázně** (Koupel) | 1 | Můžeš využívat Poušť stejně jako Hlínu (stále hod 7+). |
| **Třídění** (Klystýr) | 1 | **Před každým hodem** až 3× zadarmo přesun Ruka ↔ Zásoba. Umožňuje aktivní deck-building. |
| **Žvýkání** (Masáž Střev) | 2 | Při Spánku: Upgrade 1 kostky o 1 lvl. |
| **Bylinkový elixír** (Ajurvédská Medicína) | 3 | Při Spánku: Upgrade 1 kostky o 2 lvly, nebo 2 kostky o 1 lvl, nebo 1k12 → 1k20. |
| **Sprint** | 2 | Po Pohybu můžeš v témže tahu **Využít** pole, na které jsi se přesunul. |

---

### 6.8. Pravidlo "pole 1× za hru"
Každé pole lze využít **pouze 1× za hru**, s těmito výjimkami:

- **Záhon** a **Eukalyptus** — lze přebrat soupeři (viz Převzetí).
- **Hlína** s Mrkví soupeře — soupeř ji může odstranit a využít Hlínu pro jinou akci (Vyformuj kostku, Uč se).

Když je pole označeno značkou (Vyformuj kostku, Uč se), je trvale obsazeno a nelze ho znovu využít.

---

## 7. Útok Kočky a Čerta

Když utrpíš útok (Kočka při hodu < 5 v sousedství, Čert po neúspěšném boji), musíš **odevzdat 1 bramboru nebo 1 kostku** dle vlastní volby.

**Priorita** je na hráči — v digitální verzi vidíš dialog s nabídkou (brambora vždy první volba pokud ji máš).

### Speciální případy
- Pokud **nemáš žádnou bramboru** a v Ruce + Zásobě máš dohromady jen **1 kostku**, musíš tuto kostku **downgradovat** o 1 level (k4 → k2, k6 → k4, atd.).
- Pokud je tvá jediná kostka **1k2**, útok **ignoruj**.

---

## 8. Spánek 💤

Kdykoliv po hodu (nebo místo hodu, pokud máš v Ruce 0 kostek) se můžeš rozhodnout pro **Spánek**. Spánek není závislý na hozených hodnotách.

### Výchozí možnosti (všichni hráči)
- **Získej 1 bramboru.**
- **Downgrade kostek** — okamžitý downgrade libovolných kostek v Ruce nebo Zásobě o libovolné množství levlů.
- **Výměna se Zásobou (1×)** — jedna z:
  - Přesuň kostku z Ruky do Zásoby.
  - Přesuň kostku ze Zásoby do Ruky.
  - Vyměň kostku v Ruce s kostkou v Zásobě.
- **Teleport (5 🥔)** — přemísti Vombata na libovolné pole mapy. Cílem nesmí být pole Čerta ani živé Kočky a nesmí na něm stát jiný Vombat.
- **Skill shop** — kup libovolnou dovednost za **5 🥔 × počet požadovaných stromů**:
  - 1-strom dovednost (Kapacita, Lázně, Třídění) = **5 🥔**
  - 2-strom dovednost (Žvýkání, Sprint) = **10 🥔**
  - 3-strom dovednost (Bylinkový elixír) = **15 🥔**
  - Skill shop je alternativa k tradičnímu "Uč se" na Hlíně — nepotřebuje Eukalypty ani vybavení Hlíny.

### Možnosti s dovednostmi
- **Třídění (Klystýr)** → Před každým hodem (mimo Spánek) až 3× zdarma přesun Ruka ↔ Zásoba.
- **Masáž Střev** → Upgrade 1 kostky o 1 lvl.
- **Ajurvédská Medicína** → Upgrade 1 kostky o 2 lvly, nebo 2 kostek o 1 lvl, nebo 1k12 → 1k20.

### Brambora jako prostředek
Bramboru lze použít na:
- Odvrácení útoku Kočky / Čerta (1 brambora).
- Investice do Vyformování (každá brambora +1 ke skóre).
- Upgrade kostky (3 brambory = +1 lvl).
- Náhrada Eukalyptu při Uč se (3 brambory = 1 strom).

---

## 9. Boj s Tasmánským Čertem 👹

**Vstup na pole Čerta** je možný za běžných pravidel pohybu (hod 12+). Sám vstup ale **neaktivuje boj** — pouze stojíš na poli, které je tunelem.

### Vyhlášení boje
Pokud Vombat **stojí na** nebo **sousedí s** Čertem, můžeš se **PŘED HODEM** v daném tahu rozhodnout, že budeš s Čertem bojovat.

V boji se na hozené kostky **nedívá jako na součet**, ale **každá kostka samostatně**.

### Cíl: 4 typy zranění
Čert má 4 sloty zranění: **1**, **2**, **7+**, **10+**.

Kostka může způsobit zranění pokud její hodnota přesně odpovídá:
- **1** → kostka padla 1
- **2** → kostka padla 2
- **7+** → kostka padla ≥ 7
- **10+** → kostka padla ≥ 10

Kostky použité na zranění **propadají natrvalo** (znázorňují, že Čert je zraněn).

🎁 **Milestone bonus:** Při tvém **prvním zaneseném zranění** Čerta (jakémkoli ze 4 typů) automaticky získáš dovednost **Kapacita** zdarma. Tedy: poškoď Čerta jednou → odměna v podobě neomezené kapacity Ruky i Zásoby.

Každý hráč má **vlastní 4 sloty zranění** (každý hráč bojuje se "svým" Čertem). Jeden hráč může mít v každém slotu maximálně 1 kostku.

### Průběh boje
Hod 1:
1. Hráč hodí všemi kostkami v Ruce.
2. Pro každou kostku, která splňuje nějaký volný slot zranění, hráč rozhodne, zda ji použije (nebo nechá pro další hody).
3. Pokud **alespoň jedna kostka byla použita na zranění**, hráč pokračuje dalším hodem se **zbylými kostkami**.
4. Pokud **žádná kostka** nesplnila žádné zbývající zranění, **boj končí neúspěšně** → **útok Čerta** (viz § 7).

Hody pokračují, dokud:
- Hráč nezasadí **všechna 4 zranění** → pak musí v dalším hodu se zbylými kostkami dosáhnout **součtu 25+**. Pokud ano → **VÍTĚZSTVÍ**. Pokud ne → útok Čerta.
- Hráč v některém hodu nedokáže způsobit žádné další zranění → útok Čerta.

> **Poznámka:** Pravidlo obrany u Čerta není v základní hře aplikováno (pro 2–4 hráče by nedávalo smysl).

---

## 10. Úkoly (formace)

Vedle hlavního cíle (rozmačkat Čerta) hráči mohou splnit jeden ze 3 **prostorových úkolů**. Splnění se vyhodnocuje **automaticky** po každém umístění tvé značky (Bobek 💩 nebo Mrkev 🥕).

Bobky a Mrkve jsou pro vyhodnocení formace ekvivalentní. Postava Vombata se do formace nezapočítává. **Odměnu za stejnou formaci může každý hráč získat maximálně 1×.**

### Odměny podle pořadí splnění (pro každý druh formace zvlášť)

| Pořadí | Odměna |
|---|---|
| 1. hráč | 1k20 |
| 2. hráč | 1k12 |
| 3. hráč | 1k6 |
| 4.+ | žádná (formaci přesto získáš započítanou) |

> Odměna je kostka – přidá se jako jakákoli jiná získaná kostka (volíš velikost ≤ nabídka a kam ji umístit: Ruka/Zásoba/Čekající).

### Formace

- **Přímka 5** — 5+ tvých značek v libovolně orientované **hex-přímce po sobě jdoucích polí**. S žádným z těchto 5 hexů nesmí sousedit značka soupeře.
- **Obklíčení** — 4+ tvých značek kolem jedné značky soupeře (kolem libovolného z jeho hexů s 🥕/💩 leží minimálně 4 tvé sousední značky).
- **Průzkumník** — tvé značky leží na minimálně **6 různých dílcích** mapy (dílek = sada 7 hexů s černým/modrým středem).

### Detekce v digitální verzi
Detekce probíhá ihned po každém umístění značky. Pokud jednou akcí splníš více formací najednou (např. „Vyformuj kostku" zároveň dokončí Přímku 5 i Obklíčení), získáš odměny postupně – jednu po druhé.

---

## 11. Obecná pravidla pro kostky

### Hand a Reserve limity
- **Ruka** — max 2 kostky stejného levelu (např. nejvýše 2× 1k6). Limit zruší **Kapacita**.
- **Zásoba** — max 3 kostky. Limit zruší **Kapacita**.

### Overflow přes Kapacitu (📥 Čekající kostky)
Když hráč získá kostku během hry (Houští, Vyformuj kostku, rozmačkaná Kočka), kostka se vždy někam vejde:
1. **Pokud se vejde do Ruky** (respektuje limit) → jde do Ruky.
2. **Jinak pokud se vejde do Zásoby** (respektuje limit) → jde do Zásoby.
3. **Jinak putuje do "📥 Čekající"** zóny — kostku jsi získal, ale je dočasně zamknutá. Nelze ji použít pro hod ani jako obrana.

Jakmile hráč získá dovednost **Kapacita** (libovolnou cestou — Uč se, Sleep shop, milestone z 1. zranění Čerta), **všechny čekající kostky se okamžitě uvolní do Ruky**.

> Pozor: V **setupu** se toto pravidlo neuplatňuje. Pokud si chceš v nákupu koupit 3. stejnou kostku, prodej je odmítnut (limit 2× stejného lvl).

### Volba velikosti při získání
Kdykoliv hráč získá kostku, může se **rozhodnout pro menší** (např. 1k6 místo 1k12).

### Volba umístění
Kdykoliv hráč získá kostku, může si **vybrat Ruku nebo Zásobu** (s ohledem na limity).

### Upgrade kostek
Upgrade = zvýšení počtu stran na **nejbližší sudé číslo**:
- 1k2 → 1k4 → 1k6 → 1k8 → 1k10 → 1k12

Výjimka: **1k12 → 1k20** vyžaduje **současně 2 upgrade akce** (např. Ajurvéda, nebo upgrade + 3 brambory).

### Downgrade
Při povinném downgrade (jediná kostka při útoku, Spánek) jdeš po stejné stupnici opačně.

### Volba kostky při odhození
Kdykoliv hráč musí odhodit nebo odložit kostku, vybírá si zda z Ruky nebo Zásoby.

---

## 12. Konec hry

Hra okamžitě končí, jakmile některý hráč dosáhne svého cíle (viz § 3). V MVP je to **rozmačkání Tasmánského Čerta** (souboj v § 9).

Vítěz je oznámen na obrazovce.

---

## Příloha A — Souhrn rozhodnutí pro digitální verzi

Následující drobné body byly v původních pravidlech buď nejednoznačné, nebo explicitně otevřené. Pro digitální verzi byly rozhodnuty takto (po dohodě s autorem):

| Otázka | Rozhodnutí |
|---|---|
| MVP rozsah | 2 hráči, hot-seat na jednom zařízení |
| MVP cíl | pouze "Rozmačkej Tasmánského Čerta" |
| Vizuální styl | barevné hexy + emoji (🐾🐱👹🥕💩🥔🌳) |
| Stack | React 18 + TypeScript + Vite, SVG hex grid |
| Vnitřek dílků | předprogramovaná sada šablon (5 modrých + 3 černé), náhodně rotované |
| Skládání mapy | pevná "květina" 7 dílků (1 střed + 6 okolo) |
| Limit Ruky | max 2 kostky stejného levlu, jinak neomezeno |
| Začínající hráč | losováním |
| Druhý Vombat (5 🥔) | umístí se na stejné pole jako první |
| Útok Kočky/Čerta | hráč v dialogu volí (brambora vs. kostka) |
| Pole 1× za hru | ano, kromě převzetí Záhonu/Eukalyptu a Hlíny s Mrkví soupeře |
| Tunely | všechna černá pole + pole bývalé Kočky |
| 1k12 cena v setupu | 12 🥔 (v pravidlech neuvedeno, doplněno rozumně) |
| Vrtej | **odstraněno** v MVP — bez úkolů nemělo využití |
| Žonglování + Zácpa | **sloučeno** do dovednosti **Kapacita** (1× 🌳) — ruší oba limity najednou |
| Teleport (Spánek) | **přidáno** — 5 🥔 → přemístění Vombata kamkoli (mimo Čerta/živé Kočky/jiného Vombata). Řeší dead-end stavy. |
| Skill shop (Spánek) | **přidáno** — 5 🥔 × počet stromů → koupíš libovolnou dovednost. Alternativa k tradičnímu Uč se. |
| Milestone "1. Kočka" | **přidáno** — první rozmačkaná Kočka odemkne **Koupel** zdarma |
| Milestone "1. Zranění Čerta" | **přidáno** — první zranění Čerta odemkne **Kapacitu** zdarma |
| Overflow přes Kapacitu | **přidáno** — kostky se při získání nikdy neztratí; pokud se nevejdou nikam, čekají do získání Kapacity |
| Eukalyptus: Obsaď + Uč se | **přidáno** — 1× za hru lze místo standardního Obsaď využít Eukalyptus i pro učení dovednosti |
| Třídění (Klystýr) — redesign | **změna** — místo „neomezené výměny ve Spánku" nyní „**3× zdarma před hodem**". Cílem je donutit hráče aktivně stavět ruku každý tah (deck-building). |
| Odměna za Kočku | **změna** — 1k20 → **1k8**. K20 byla příliš dominantní strategie (84-96 % win rate při 2+ rozdrcených kočkách). 1k8 je solidní bonus, ale ne instant-win. Milestone Lázně zdarma za 1. kočku zachováno. |

---

## Příloha B — MVP zjednodušení (k doladění)

Tyto věci jsou v aktuální digitální verzi zjednodušené:

1. **Obrana kostkou** na Záhonu/Eukalyptu — takeover lze provést bez ověření vyšší kostky.
2. **Investice brambor do Vyformování** — UI dialog zatím nenabízí; počítá se jen carrotTrack + sousední markery.
3. ~~**Úkoly (formace)** — celá sekce neimplementována.~~ ✅ Implementováno.
4. **3–4 hráči** — neimplementováno (vyžaduje další šablony a layout 10/13 dílků).
5. **Vítězné cíle 2 a 3** — neimplementováno.
