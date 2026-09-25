# WX-SCOPE

Desktop weather radar: a high-refresh PPI scope with live lightning and automatic close-strike identification.

## Run

```bash
npm install
npm run desktop
```

That opens a native Windows window with the WX-SCOPE icon. `start-desktop.bat` does the same.

Browser-only:

```bash
npm run dev
```

Pack a Windows app with icon (`release/WX-SCOPE/WX-SCOPE.exe`):

```bash
npm run dist
```

Keys: `F` fullscreen, `G` GPS, `+`/`-` range, `M` mute.

## What it does

- **60 fps PPI display** centered on your location, with phosphor sweep persistence.
- **Radar** from IEM MRMS / NEXRAD over the US, RainViewer worldwide. Polar-projected onto the scope.
- **Street map** (Esri World Street Map) under the returns. Drop range to 5–10 mi for street-level names.
- **Current precipitation** at your fix from Open-Meteo (type + last hour).
- **Live lightning** from Blitzortung.org. Each in-range strike is identified with range, true bearing, and class.
- **Close-strike watch** using the 30-30 rule (default 6 miles). Overhead (< 1 mi) and close strikes get a callout, log entry, and audio cue.

## Data

- Radar: [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu/) (NWS MRMS & NEXRAD), [RainViewer](https://www.rainviewer.com/)
- Lightning: [Blitzortung.org](https://www.blitzortung.org/) volunteer network
- Personal / educational use. Radar frames update about every minute; lightning is streamed in near real time.
