const AUTH_KEY = 'opennow.webos.authSession';
const SETTINGS_KEY = 'opennow.webos.settings';
const PROVIDER_KEY = 'opennow.webos.provider';
const PENDING_ALLOCATION_KEY = 'opennow.webos.pendingAllocation';

const DEFAULT_SETTINGS = {
	bitrateMbps: 35,
	colorQuality: '8bit_420',
	enableCloudGsync: false,
	enableL4S: false,
	fps: 60,
	region: '',
	resolution: '1920x1080'
};

function readJson (key, fallback) {
	try {
		const value = window.localStorage.getItem(key);
		return value ? JSON.parse(value) : fallback;
	} catch (error) {
		return fallback;
	}
}

function writeJson (key, value) {
	try {
		window.localStorage.setItem(key, JSON.stringify(value));
	} catch (error) {
		// webOS storage can fail in low-space scenarios; keep runtime state alive.
	}
}

export function loadAuthSession () {
	return readJson(AUTH_KEY, null);
}

export function saveAuthSession (session) {
	if (!session) {
		window.localStorage.removeItem(AUTH_KEY);
		return;
	}
	writeJson(AUTH_KEY, session);
}

export function loadSettings () {
	return {
		...DEFAULT_SETTINGS,
		...readJson(SETTINGS_KEY, {})
	};
}

export function saveSettings (settings) {
	writeJson(SETTINGS_KEY, settings);
}

export function loadProvider () {
	return readJson(PROVIDER_KEY, null);
}

export function saveProvider (provider) {
	if (!provider) {
		window.localStorage.removeItem(PROVIDER_KEY);
		return;
	}
	writeJson(PROVIDER_KEY, provider);
}

export function loadPendingAllocation () {
	return readJson(PENDING_ALLOCATION_KEY, null);
}

export function savePendingAllocation (allocation) {
	if (!allocation) {
		window.localStorage.removeItem(PENDING_ALLOCATION_KEY);
		return;
	}
	writeJson(PENDING_ALLOCATION_KEY, allocation);
}
