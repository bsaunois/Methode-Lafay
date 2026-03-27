# Méthode Lafay

A mobile-first PWA to follow the Méthode Lafay workout program, hosted on Firebase.

## Features

- Exercise list with progression tracking
- Rep counter with rest timer
- Warm-up screen with guided steps
- Dark theme optimized for mobile use

## Project structure

```
public/
  index.html        # Single-page app (HTML + CSS + JS)
livreHomme/         # Méthode Lafay (homme) — split in two PDFs
livreFemme/         # Méthode Lafay (femme) — split in two PDFs
firebase.json       # Firebase Hosting config
.firebaserc         # Firebase project reference
```

## Deploy

```bash
npm install -g firebase-tools
firebase login
firebase deploy
```
