const CLIENT_VERSION = '2.0.87.131';
const LCARS_CLIENT_ID = 'ec7e38d4-03af-4b58-b131-cfb0495903ab';
const WEBOS_CLIENT_ID_KEY = 'opennow.webos.clientId';
const WEBOS_DEVICE_ID_KEY = 'opennow.webos.deviceId';
export const STEAM_DECK_CLIENT_ID = 'q61ddeJrVt7O90Nl-P-N7I36yctih4Ml6FyXLrb6j-U';
export const DEFAULT_IDP_ID = 'PDiAhv2kJTFeQ7WOPqiQ2tRZ7lGhR2X11dXvM4TZSxg';
export const SCOPES = 'openid consent email tk_client age';
export const GFN_PLAY_ORIGIN = 'https://play.geforcenow.com';
export const GFN_PLAY_REFERER = 'https://play.geforcenow.com/';

function randomId () {
	if (window.crypto?.randomUUID) {
		return window.crypto.randomUUID();
	}

	const bytes = new Uint8Array(16);
	if (window.crypto?.getRandomValues) {
		window.crypto.getRandomValues(bytes);
	} else {
		for (let i = 0; i < bytes.length; i += 1) {
			bytes[i] = Math.floor(Math.random() * 256);
		}
	}

	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function persistentId (key) {
	const stored = window.localStorage.getItem(key);
	if (stored) {
		return stored;
	}

	const nextId = randomId();
	window.localStorage.setItem(key, nextId);
	return nextId;
}

export function getClientId () {
	return persistentId(WEBOS_CLIENT_ID_KEY);
}

export function getDeviceId () {
	return persistentId(WEBOS_DEVICE_ID_KEY);
}

export function buildGfnHeaders (authSession) {
	const token = authSession?.tokens?.idToken || authSession?.tokens?.accessToken;
	return {
		'Accept': 'application/json',
		'Content-Type': 'application/json',
		'Origin': GFN_PLAY_ORIGIN,
		'Referer': GFN_PLAY_REFERER,
		'nv-browser-type': 'CHROME',
		'nv-client-id': LCARS_CLIENT_ID,
		'nv-client-streamer': 'NVIDIA-CLASSIC',
		'nv-client-type': 'NATIVE',
		'nv-client-version': CLIENT_VERSION,
		'nv-device-make': 'LG',
		'nv-device-model': 'WEBOS_TV',
		'nv-device-os': 'WEBOS',
		'nv-device-type': 'TV',
		'x-device-id': getDeviceId(),
		...(token ? {'Authorization': `GFNJWT ${token}`} : {})
	};
}

export function buildGfnBrowserHeaders (authSession) {
	const token = authSession?.tokens?.idToken || authSession?.tokens?.accessToken;
	return {
		'Accept': 'application/json, text/plain, */*',
		'Authorization': `GFNJWT ${token}`,
		'Origin': GFN_PLAY_ORIGIN,
		'Referer': GFN_PLAY_REFERER,
		'nv-browser-type': 'CHROME',
		'nv-client-id': LCARS_CLIENT_ID,
		'nv-client-streamer': 'WEBRTC',
		'nv-client-type': 'BROWSER',
		'nv-client-version': CLIENT_VERSION,
		'nv-device-make': 'LG',
		'nv-device-model': 'WEBOS_TV',
		'nv-device-os': 'WEBOS',
		'nv-device-type': 'TV',
		'x-device-id': getDeviceId()
	};
}

export function buildAuthHeaders (contentType = 'application/x-www-form-urlencoded; charset=UTF-8') {
	return {
		'Accept': 'application/json, text/plain, */*',
		'Content-Type': contentType,
		'nv-browser-type': 'CHROME',
		'nv-client-id': STEAM_DECK_CLIENT_ID,
		'nv-client-platform-name': 'browser',
		'nv-client-streamer': 'WEBRTC',
		'nv-client-type': 'BROWSER',
		'nv-device-make': 'VALVE',
		'nv-device-model': 'STEAMDECK',
		'nv-device-os': 'STEAMOS',
		'nv-device-type': 'CONSOLE',
		'x-device-id': getDeviceId()
	};
}
