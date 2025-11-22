# Shorttrack Hub

Eenvoudige statische site om snel overzicht te houden over shorttrack-data:

- Standings
- Records
- World Champions
- Olympic Champions
- Men’s Skaters
- Women’s Skaters
- Head to Head

## World Champions-module

De pagina **World Champions** heeft:

- Switch tussen **Men** en **Women** (bovenin).
- Tabs voor de afstanden **500 m**, **1000 m**, **1500 m** en **Relay**.
- Per combinatie een tabel met kolommen: **Jaar – Plaats – Goud – Zilver – Brons**.
- Goud/zilver/brons worden visueel gemarkeerd met kleine medaille-dots.

In de HTML staan nu voorbeeldrijen (2025 / Beijing).  
Vervang deze eenvoudig door de echte data (bijv. vanuit je Wikipedia-overzicht):

```html
<tr>
  <td class="wc-col-year">2025</td>
  <td class="wc-col-venue">Beijing</td>
  <td>… goud …</td>
  <td>… zilver …</td>
  <td>… brons …</td>
</tr>
```

Kopieer de `<tr>`-structuur voor elk jaar dat je wilt opnemen.

## Gebruik

1. Maak een lege GitHub-repository.
2. Download het zip-bestand dat je van ChatGPT krijgt.
3. Pak het zip-bestand lokaal uit.
4. Upload alle bestanden en mappen naar de `main` branch van je repo.
5. Activeer GitHub Pages (bijvoorbeeld vanaf de `main` branch, root-folder).

De structuur is:

- `index.html` — hoofdpagina met navigatie.
- `world-champions/index.html` — interactieve World Champions-tabellen.
- `assets/styles.css` — gezamenlijke styling.
- `assets/world-champions.js` — logica voor tabs en switch.
- één map per overige module met een eigen `index.html` (placeholder).