# FloriSynergy Scout mobile app

This Flutter app provides a mobile-first scouting workflow for field scouts.

## Run locally

```bash
cd mobile
flutter pub get
flutter run
```

## What it does

- Logs scouts in with the existing backend auth flow
- Captures scouting reports for pest, disease, lure, and sticky trap events
- Submits reports to the backend scouting batch endpoint

## Backend requirements

The app expects the backend API to be running at:

- Android emulator: http://10.0.2.2:8000
- iOS simulator: http://localhost:8000
