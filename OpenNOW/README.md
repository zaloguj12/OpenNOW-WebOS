# OpenNOW webOS 3.0

This directory contains the OpenNOW client for older LG webOS TV targets. It
is a lightweight HTML5 and JavaScript application intended for the legacy
webOS browser runtime.

> [!IMPORTANT]
> A GeForce NOW account and a compatible webOS TV are required for real
> service use.

> [!WARNING]
> This version is experimental. Authentication, catalog data, WebRTC playback,
> gamepad input, and webOS behavior depend on the target TV and service APIs.

## Features

- Static HTML, CSS, and JavaScript application with no npm build step.
- Phone or device login flow with QR-code support.
- Game catalog browsing and launch flow.
- Spatial navigation for remote-control and keyboard use.
- Cloud session and WebRTC playback modules.
- webOS TV service integration and local browser persistence where supported.

## Project layout

```text
OpenNOW/
├── index.html
├── css/style.css
├── js/
│   ├── app.js
│   ├── gfn-client.js
│   ├── gfn-webrtc.js
│   ├── spatial-nav.js
│   ├── promise-polyfill.js
│   └── qrcode.min.js
├── webOSTVjs-1.2.13/
├── appinfo.json
├── icon.png
├── largeIcon.png
├── logo.png
├── splash.png
└── README.md
```

## Development

The application is served as static files. From the repository root, use any
static HTTP server, for example:

```text
cd OpenNOW
python -m http.server 8080
```

Opening the application through HTTP is preferred over loading `index.html`
directly because browser security rules can block service requests from a
`file://` page.

## Package and install

The app metadata uses ID `com.zaloguj.opennow.basic` and a 1920x1080 display.
With the webOS CLI installed and a configured TV device:

```text
ares-package OpenNOW -o ./builds
ares-install --device <device_name> ./builds/com.zaloguj.opennow.basic_1.0.0_all.ipk
ares-launch --device <device_name> com.zaloguj.opennow.basic
```

The exact package filename can vary with the installed webOS CLI version.

## Input

The app is designed for the TV remote's directional controls and Back action.
Keyboard input can be used during desktop testing when supported by the
browser. Focus movement is handled by `js/spatial-nav.js`.

## Known limitations

- A valid NVIDIA/GeForce NOW session is required for authenticated flows.
- Browser and codec support varies across webOS TV generations.
- WebRTC playback, controller input, and service endpoints may require changes
  for a particular TV firmware or backend response.
- The `scratch` development material is intentionally not part of this branch.

## Implementation relationship

This application follows the same OpenNOW service concepts as the newer 4.0+
webOS client, but it is an independent implementation for older runtime
constraints. It is not a direct port of the desktop client or of the 4.0+
Enact application. The branch uses its own vanilla JavaScript UI, state flow,
storage, service client, signaling, and WebRTC integration.

The repository contains only the webOS application. It does not include the
normal upstream OpenNOW codebase.
