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

The crosshair is your fix. Click **GPS** (or press `G`) to center on Windows location, or type latitude and longitude in FIX. An IP estimate is city-level and will sit off your house.

## What it does

- **60 fps PPI display** centered on your location, with phosphor sweep persistence.
- **Radar** from NOAA NCEP MRMS (the radar.weather.gov 2-minute mosaic) over the US, IEM as fallback, RainViewer worldwide. Polar-projected onto the scope; new scans stamp in under the sweep.
- **Street map** (Esri World Street Map) under the returns. Drop range to 5–10 mi for street-level names.
- **Current precipitation** at your fix from Open-Meteo (type + last hour).
- **Live lightning** from Blitzortung.org. Each in-range strike is identified with range, true bearing, and class.
- **Close-strike watch** using the 30-30 rule (default 6 miles). Overhead (< 1 mi) and close strikes get a callout, log entry, and audio cue.

## Data

- Radar: [NCEP MRMS](https://opengeo.ncep.noaa.gov/) (same 2-minute QC'd mosaic as [radar.weather.gov](https://radar.weather.gov/)), [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu/) fallback, [RainViewer](https://www.rainviewer.com/) worldwide
- Lightning: [Blitzortung.org](https://www.blitzortung.org/) volunteer network
- Personal / educational use. Radar tiles are polled every 15 seconds by default (15–60s in SCOPE). NOAA MRMS scans land about every 2 minutes; RainViewer about every 10. The sweep paints each new scan onto the scope as the beam passes. Lightning is streamed in near real time.
