# Příručka pro administrátory

Stručný návod pro správu kurzu. Administraci najdete po přihlášení pod odkazem **Administrace** v horní liště.

## Pozvání studujících

1. **Administrace → Uživatelé → Nové účty.**
2. Vložte jeden nebo více e-mailů (oddělené novým řádkem, čárkou nebo mezerou), zvolte roli a klikněte na **Vytvořit a pozvat**.
3. Výsledek se zobrazí u každé adresy zvlášť:
   - **vytvořen**: účet existuje a pozvánka byla předána k odeslání;
   - **neplatná adresa / účet už existuje / v seznamu vícekrát**: účet nevznikl, ostatní adresy to neovlivnilo. Adresy, které vyžadují pozornost, zůstanou v poli k opravě.
4. Každý studující dostane e-mail s **jednorázovým heslem**. Po prvním přihlášení si musí nastavit vlastní heslo.

„Odesláno“ znamená, že e-mail převzal poštovní server, ne že ho studující přečetl. Stav účtu („čeká na aktivaci“, „aktivní“) se zobrazuje odděleně od stavu pozvánky.

## Když pozvánka nepřišla nebo vypršela

- Otevřete účet (klikněte na e-mail v seznamu) a zvolte **Znovu odeslat pozvánku**. Předchozí jednorázové heslo tím přestane platit.
- Jednorázové heslo platí 7 dní a funguje, dokud si studující nenastaví vlastní heslo. Přerušenou první aktivaci lze tedy dokončit s tím samým heslem.
- Pokud odeslání selhalo („selhalo: …“), zkontrolujte adresu a zkuste to znovu. Při opakovaných chybách předejte chybovou zprávu správci serveru.

## Zapomenuté heslo a obnova přístupu

- Studující si heslo obnoví sami odkazem **Zapomenuté heslo** na přihlašovací stránce. Odkaz v e-mailu platí 60 minut a lze ho použít jen jednou.
- Pokud to nejde (nepřichází e-mail, studující zapomněl i e-mail), otevřete účet a zvolte **Obnovit přístup**. Současné heslo přestane platit, studující bude odhlášen a dostane nové jednorázové heslo.
- Hesla studujících nikdo nevidí a nelze je zjistit.

## Úprava, deaktivace a smazání účtu

- **Údaje**: změna e-mailu nebo role.
- **Deaktivovat**: okamžitě ukončí přístup, ale účet i odpovědi zůstanou. **Znovu aktivovat** přístup vrátí.
- **Trvale smazat účet**: odstraní účet **i všechny jeho uložené odpovědi**. Před smazáním si je můžete stáhnout jako Markdown; pro potvrzení je nutné opsat e-mail účtu.
- Posledního aktivního administrátora nelze deaktivovat, smazat ani mu odebrat roli. Vlastní účet nelze deaktivovat ani smazat.

## Čtení odpovědí

- **Administrace → Odpovědi**. Filtrujte podle studujícího nebo cvičení.
- U každé odpovědi je vidět studující, lekce a cvičení, čas uložení a naformátovaný text.
- Upozornění „dřívější verze cvičení“ znamená, že se od uložení změnilo zadání. „Cvičení už v materiálech není“ znamená, že bylo z obsahu odstraněno; odpověď ale zůstává uložená.
- **Stáhnout jako Markdown** exportuje zobrazené odpovědi.
- Uložení neznamená, že byla odpověď přečtena nebo hodnocena. Aplikace neposílá žádná upozornění ani hodnocení.

## Aktualizace obsahu

1. Autoři upraví materiály v obsahovém repozitáři (nejlépe po kontrole `npm run content:validate`) a změny nahrají do větve, kterou web sleduje.
2. **Administrace → Obsah → Aktualizovat obsah.** Web stáhne nejnovější verzi, zkontroluje ji a teprve pak ji zveřejní všem najednou.
3. Když kontrola selže, zobrazí se seznam chyb se souborem a řádkem a studující dál vidí dosavadní verzi. Opravte chyby v repozitáři a aktualizaci spusťte znovu.

Jedna aktualizace zveřejní **všechny kurzy** z repozitáře najednou (hlavní kurz i další kurzy v podadresářích, např. `data/`). Chyba v kterémkoli kurzu zastaví celou aktualizaci a zůstává předchozí verze všech kurzů. Chyby dalších kurzů poznáte podle cesty k souboru (`data/…`). Stránka **Obsah** ukazuje názvy zveřejněných kurzů.

Obsah se nikdy neaktualizuje sám: ani podle času, ani při změně v repozitáři, ani návštěvou studujícího.

## Podpora studujících

- Kontakt na podporu uvedený v e-mailech: proměnná `SUPPORT_EMAIL`.
- Nejčastější situace:
  - **„Nepřišla mi pozvánka“**: zkontrolovat spam, poslat pozvánku znovu.
  - **„Nefunguje mi jednorázové heslo“**: platí jen poslední pozvánka a jen do nastavení vlastního hesla. Případně poslat novou.
  - **„Zapomněl(a) jsem heslo“**: odkaz Zapomenuté heslo, případně Obnovit přístup.
  - **„Nevidím materiály“**: je obsah zveřejněný (Administrace → Obsah)? Není účet deaktivovaný?


## Stav materiálů a připomínky

Na úvodní stránce každého kurzu vidí administrátoři u lekcí stav **Připraveno**, **Rozpracováno**, **Nezahájeno** nebo **Stav neznámý**. Stav se upravuje v `lecture.yaml` polem `status` (`ready`, `in-progress`, `not-started`, `unknown`) a zveřejňuje běžnou aktualizací obsahu. Chybějící stav znamená neznámý. Studující stav nevidí; přístup k lekci se stavem nemění.

V rozpracované lekci je vpravo dole tlačítko **Přidat připomínku**, které zůstává dostupné při posouvání. Vyberte text materiálu před kliknutím a vloží se jako citace; lze také napsat připomínku bez výběru. Text podporuje Markdown. Tlačítko **Uložit připomínku** vytvoří GitHub issue v obsahovém repozitáři. Issue obsahuje váš e-mail, odkaz na část, zdrojový soubor a zveřejněnou revizi. Poté se zobrazí odkaz na vytvořené issue. Připomínky se neukládají do databáze webu a není zde interní historie.

Issue se přiřadí vlastníkovi osobního repozitáře, u organizace uživateli `pesikj`. Pokud přiřazení není možné, vznikne nepřiřazené issue a zobrazí se upozornění. Při chybě odeslání text zůstane v dialogu. Při nejasném výsledku nejprve zkontrolujte issues v repozitáři (odkaz se otevře v nové kartě a rozepsaný text zůstane zachovaný), aby opakovaným odesláním nevznikla duplicita. Zavřením stránky se neodeslaný text ztratí. Pokud se mezitím zveřejnily nové materiály, zkopírujte si text a obnovte stránku. Hlášení vyžaduje JavaScript a nastavený GitHub token (viz provozní dokumentace).
