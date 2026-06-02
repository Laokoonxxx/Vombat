# Vombat — nasazení na Web4U

Tato složka obsahuje **vše, co se má nahrát na hosting** = staticky vybuildovaný React frontend + PHP backend pro online multiplayer.

## Struktura

```
deploy/
├── index.html              ← vstupní stránka (React app)
├── assets/                 ← JS + CSS bundly z `npm run build`
│   ├── index-*.js
│   └── index-*.css
├── api/                    ← REST endpointy (POST/GET JSON)
│   ├── create_game.php
│   ├── join_game.php
│   ├── start_game.php
│   ├── submit_move.php
│   ├── poll.php
│   └── end_game.php
├── includes/               ← PHP helpery (PDO singleton, JSON, herní logika)
│   ├── v_db.php
│   ├── v_init.php
│   ├── v_json.php
│   └── v_game.php
├── sql/
│   └── schema_vombat.sql   ← spustit JEDNOU v MariaDB (vytvoří 3 tabulky)
├── bootstrap.php
├── config.example.php      ← vzor — zkopíruj jako config.php a vyplň credentials
└── README-DEPLOY.md        ← tento soubor
```

## Postup nasazení (Web4U)

1. **Vytvoř `config.php` z předlohy:**

   Zkopíruj `config.example.php` → `config.php` a doplň skutečné údaje:

   ```php
   define('DB_HOST', 'sql23.web4u.cz');
   define('DB_NAME', 'pisecnic');
   define('DB_USER', 'pisecnic');
   define('DB_PASS', '...');           // skutečné heslo
   define('SITE_URL', 'https://vombat.pisecnici.cz');
   ```

   ⚠️ **`config.php` nikdy necommituj do gitu** — je v `.gitignore`.

2. **Nahraj obsah této složky** přes FTP / file manager **do kořene web prostoru**
   (typicky `/www/` nebo `/public_html/`). Po nahrání by struktura na serveru měla vypadat takto:

   ```
   /www/
   ├── index.html
   ├── assets/
   ├── api/
   ├── includes/
   ├── sql/
   ├── bootstrap.php
   ├── config.php           ← (vytvořený v kroku 1)
   └── (config.example.php  ← klidně smaž z produkce)
   ```

3. **Spusť SQL schéma jednou** přes phpMyAdmin (Web4U interface):
   - Přihlas se do databáze `pisecnic`
   - SQL záložka → vlož obsah `sql/schema_vombat.sql` → Proveď
   - Mělo by se vytvořit `vombat_games`, `vombat_players`, `vombat_moves`

4. **Otevři `https://vombat.pisecnici.cz/`** — měl by se načíst React UI s tlačítky
   Hot-seat / Proti AI / Online.

5. **Otestuj online:**
   - V jednom prohlížeči klikni "🌐 Online" → "🆕 Vytvořit místnost"
   - Dostaneš 6-místný kód (např. `ABC234`)
   - Ve druhém okně nebo zařízení: "🌐 Online" → "🔑 Připojit se kódem" → zadej kód
   - Host klikne "🎲 Spustit hru" → oba klienti přejdou do herní obrazovky.

## Co backend dělá / nedělá

- ✅ Append-only zápis akcí přes `submit_move.php` (kontroluje `seq` pořadí a vlastníka tokenu)
- ✅ Polling stav přes `poll.php?gameId=X&since=N` (klient stahuje akce od posledního seq)
- ✅ Lobby flow: create → join → start → active → ended
- ❌ **Server neuvalidňuje pravidla** — pravidla hájí klient (engine.ts). Klient s upraveným kódem může cheatovat (vhodné jen pro hru s přáteli).
- ❌ **Žádné WebSockets** — sdílený hosting nepodporuje. Klient polluje každé 2 s (pauzuje, když je na tahu).
- ❌ **Žádný garbage collection** starých her — tabulky budou narůstat. Pro očistu spusť ručně:
  ```sql
  DELETE FROM vombat_games WHERE status = 'ended' AND updated_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
  -- (vombat_players a vombat_moves se smažou kaskádou)
  ```

## Update / nová verze

Pokud později rebuilduješ (nový `npm run build`), nahraj znovu:
- `index.html`
- `assets/` (názvy souborů obsahují hash, takže staré soubory v `assets/` můžou zůstat, ale je čistší je smazat)
- Případně změněné PHP soubory

`config.php` a tabulky v DB se NEMĚNÍ — schéma jsem nemigroval.

## Známé limity

- **Žádný auto end_game při výhře** — `winnerId` se nastaví v lokálním stavu klienta, ale `vombat_games.status` zůstane `'active'`, dokud někdo neopustí. **TODO** pro produkci: detekovat `state.winnerId` v App.tsx a zavolat `apiEndGame()`.
- **Žádný reconnect UX po síťové chybě** — polling se sám zkusí dále, ale uživatel nevidí žádnou indikaci offline.
- **Pouze 2-4 hráče** — engine ano, ale ladění balance 3-4 nebylo provedeno.
