# Méthode Lafay

A mobile-first PWA to follow the Méthode Lafay workout program, hosted on Firebase.

## Tech stack

- **No framework, no build step**: plain HTML/CSS/JS served as static files
- **Hosting**: Firebase Hosting → `https://methode-lafay-c0041.web.app`
- **Firebase project**: `methode-lafay-c0041` (see `.firebaserc`)
- **Fonts**: Barlow Condensed + JetBrains Mono (Google Fonts)

## Deploy

```bash
firebase deploy
```

## Project structure

```
public/
  index.html          # HTML shell — login screen, app skeleton, onboarding overlays, script tags
  css/
    styles.css        # All CSS (variables, layout, themes, components)
  js/
    data.js           # Exercise/program/stretch data arrays and lookup objects
    firebase.js       # Firebase init, auth, Firestore sync (push/pull/listener)
    app.js            # All app logic: state, rendering, timers, session, onboarding
livreHomme/
  MéthodeLafayHomme.pdf
livreFemme/
  MethodeLafayFemme.pdf
firebase.json         # Firebase Hosting config (public dir, SPA rewrites, no-cache headers)
.firebaserc           # Firebase project reference
```

### JS load order (matters — no ES modules, all globals)

1. Firebase CDN scripts (`firebase-app-compat`, `firebase-auth-compat`, `firebase-firestore-compat`)
2. `data.js` — no dependencies
3. `firebase.js` — needs Firebase SDK; forward-references `A` and `renderTab` from `app.js` (safe, called after DOM load)
4. `app.js` — uses data globals and firebase globals

## App features

- Google login (auth screen on first load)
- Onboarding flow (gender selection, capacity test)
- Two programs: **Homme** (orange accent `#f97316`) and **Femme** (pink accent `#e879a0`)
- Tabs: Exercices, Programme, Souplesse, Moi
- Exercise session: rep counter, rest timer overlay, set tracking
- Warm-up screen with step-by-step guided flow
- Capacity test to determine starting level
- Weekly calendar view with workout history
- "Moi" tab: session history with per-exercise reps logged

## PDFs du projet

- **Homme** : `livreHomme/MéthodeLafayHomme.pdf`
- **Femme** : `livreFemme/MethodeLafayFemme.pdf`

Pour lire une page spécifique, dire par exemple "lis la page 16 du livre homme".
Poppler est installé sur la machine (`pdftoppm` disponible).
