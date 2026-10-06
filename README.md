# Neon Arena — wersja pod Render

Ta paczka zawiera kompletną grę i serwer Node.js.

## Uruchomienie lokalne

1. Zainstaluj Node.js 22 lub nowszy.
2. W folderze projektu uruchom `npm start`.
3. Otwórz `http://localhost:3000`.

## Publikacja przez GitHub i Render

1. Wgraj całą zawartość tego folderu do głównego katalogu repozytorium GitHub.
2. W Render wybierz **New +** → **Blueprint** i połącz repozytorium.
3. Render odczyta plik `render.yaml` i ustawi usługę automatycznie.

Możesz też utworzyć **Web Service** ręcznie:

- Runtime: `Node`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

Pokoje multiplayer są przechowywane w pamięci serwera. Po restarcie darmowej usługi Render aktywne pokoje zostaną wyczyszczone, ale pliki gry i postęp kodu pozostaną na GitHubie.
