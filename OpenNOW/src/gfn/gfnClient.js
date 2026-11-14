import {
	DEFAULT_IDP_ID,
	SCOPES,
	STEAM_DECK_CLIENT_ID,
	buildAuthHeaders,
	buildGfnBrowserHeaders,
	buildGfnHeaders,
	getClientId,
	getDeviceId
} from './clientHeaders';
import {loadAuthSession, loadPendingAllocation, saveAuthSession, savePendingAllocation} from './storage';

const AUTH_BASE_URL = 'https://login.nvidia.com';
const CATALOG_BASE_URL = 'https://games.geforce.com';
const CLOUDMATCH_BASE_URL = 'https://prod.cloudmatchbeta.nvidiagrid.net';
const DEFAULT_STREAMING_BASE_URL = `${CLOUDMATCH_BASE_URL}/`;
export const PROVIDERS = [
	{code: 'NVIDIA', displayName: 'NVIDIA GeForce NOW', idpId: DEFAULT_IDP_ID, streamingServiceUrl: DEFAULT_STREAMING_BASE_URL, available: true},
	{code: 'DIG', displayName: 'GeForce NOW Alliance', idpId: 'IsvVBA3Aj8KZ7gwwuRUhB6-tOF2o2F1wncD-XjYv100', streamingServiceUrl: '', available: false}
];

async function fetchJson (url, init) {
	const response = await fetch(url, init);
	const text = await response.text();
	const data = text ? JSON.parse(text) : null;

	if (!response.ok) {
		throw new Error(data?.error_description || data?.error || `Request failed with ${response.status}`);
	}

	return data;
}

function normalizeGame (entry) {
	const variant = entry.variants?.[0] || {};
	const images = entry.images || {};
	const imageUrl = (value, width) => {
		const source = Array.isArray(value) ? value.find(Boolean) : value;
		if (!source || !source.includes('img.nvidiagrid.net')) return source;
		const [path, query] = source.split('?');
		const parts = path.split('/');
		const file = parts.pop() || '';
		const base = file.split(';')[0];
		const modifiers = file.split(';').slice(1).filter((modifier) => !/^(f|w|h|dpr)=/.test(modifier));
		modifiers.push('f=jpg', `w=${width}`);
		return `${[...parts, `${base};${modifiers.join(';')}`].join('/')}${query ? `?${query}` : ''}`;
	};
	return {
		genre: entry.genre || entry.genres?.[0] || entry.appGenres?.[0] || entry.publisherName,
		id: String(entry.id || entry.appId || entry.cmsId || variant.id || entry.title),
		images: {
			boxArt: imageUrl(images.GAME_BOX_ART, 600),
			hero: imageUrl(images.MARQUEE_HERO_IMAGE, 1920) || imageUrl(images.HERO_IMAGE, 1920),
			keyArt: imageUrl(images.KEY_ART, 1200) || imageUrl(images.KEY_IMAGE, 1200),
			logo: imageUrl(images.GAME_LOGO, 600),
			tvBanner: imageUrl(images.TV_BANNER, 1920)
		},
		launchAppId: String(variant.id || entry.id || entry.appId || ''),
		status: variant.gfn?.status || entry.gfn?.playabilityState || (entry.isSupported === false ? 'Unsupported' : 'Ready'),
		store: variant.appStore || entry.store || entry.stores?.[0] || entry.platform || 'GeForce NOW',
		title: entry.title || entry.name || entry.appName || 'Untitled game'
	};
}

function toFormBody (fields) {
	const body = new URLSearchParams();
	Object.entries(fields).forEach(([key, value]) => {
		if (value !== undefined && value !== null) {
			body.set(key, String(value));
		}
	});
	return body;
}

function tokenFromSession (authSession) {
	return authSession?.tokens?.idToken || authSession?.tokens?.accessToken;
}

function parseResolution (resolution) {
	const [rawWidth, rawHeight] = resolution.split('x');
	const width = Number.parseInt(rawWidth, 10);
	const height = Number.parseInt(rawHeight, 10);
	return {
		height: Number.isFinite(height) && height > 0 ? height : 1080,
		width: Number.isFinite(width) && width > 0 ? width : 1920
	};
}

function phaseForStatus (status) {
	switch (Number(status)) {
		case 1: return 'preparing';
		case 2: return 'ready';
		case 3: return 'streaming';
		case 4:
		case 5: return 'paused';
		case 6: return 'resuming';
		case 7: return 'finished';
		default: return Number(status) > 3 ? 'failed' : 'requesting';
	}
}

function firstString (value) {
	if (typeof value === 'string' && value) return value;
	if (typeof value === 'number') return String(value);
	if (Array.isArray(value)) return firstString(value[0]);
	return '';
}

function queuePosition (session) {
	return [session?.queuePosition, session?.seatSetupInfo?.queuePosition, session?.sessionProgress?.queuePosition, session?.progressInfo?.queuePosition]
		.map(Number).find((value) => Number.isFinite(value) && value > 0) || null;
}

function normalizeIceServers (session) {
	const configured = session?.iceServerConfiguration?.iceServers || [];
	const servers = configured.map((entry) => ({...entry, urls: Array.isArray(entry.urls) ? entry.urls : [entry.urls]})).filter((entry) => entry.urls.some(Boolean));
	return servers.length ? servers : [{urls: ['stun:stun.l.google.com:19302']}];
}

function normalizeSession (payload, base, fallbackAppId) {
	const session = payload?.session || payload || {};
	const connections = Array.isArray(session.connectionInfo) ? session.connectionInfo : [];
	const signaling = connections.find((connection) => Number(connection.usage) === 16 || (Number(connection.usage) === 14 && [1, 6].includes(Number(connection.appLevelProtocol))));
	const signalingAddress = signaling && (firstString(signaling.ip) || firstString(signaling.resourcePath));
	const signalingUrl = session.signalingUrl || payload?.signalingUrl || (signalingAddress ? (signalingAddress.startsWith('rtsps://') ? signalingAddress.replace(/^rtsps:/, 'wss:') : `wss://${signalingAddress}:${signaling.port || 443}`) : '');
	const serverIp = firstString(signaling?.ip) || firstString(session.sessionControlInfo?.ip) || new URL(base).hostname;
	const status = Number(session.status || 0);
	return {
		...session,
		appId: firstString(session.sessionRequestData?.appId) || fallbackAppId,
		connectionInfo: connections,
		iceServers: normalizeIceServers(session),
		phase: phaseForStatus(status),
		queuePosition: queuePosition(session),
		serverIp,
		sessionId: session.sessionId || payload?.sessionId,
		signalingServer: serverIp.includes(':') ? serverIp : `${serverIp}:443`,
		signalingUrl,
		streamingBaseUrl: session.streamingBaseUrl || base,
		status
	};
}

function regionEntries (payload) {
	const metadata = Array.isArray(payload?.metaData) ? payload.metaData : [];
	const valueFor = (key) => metadata.find((entry) => entry.key === key)?.value;
	const names = [valueFor('local-region'), ...(valueFor('gfn-regions') || '').split(',')].map((value) => String(value || '').trim()).filter(Boolean);
	return names.map((name) => ({name, url: valueFor(name)})).filter((entry) => entry.url).filter((entry, index, entries) => entries.findIndex((item) => item.url === entry.url) === index);
}

function colorQualityValues (colorQuality) {
	switch (colorQuality) {
		case '10bit_444':
			return {bitDepth: 1, chromaFormat: 1};
		case '10bit_420':
			return {bitDepth: 1, chromaFormat: 0};
		case '8bit_444':
			return {bitDepth: 0, chromaFormat: 1};
		default:
			return {bitDepth: 0, chromaFormat: 0};
	}
}

async function fetchVpcId (authSession) {
	const token = tokenFromSession(authSession);
	const base = authSession?.provider?.streamingServiceUrl || DEFAULT_STREAMING_BASE_URL;
	try {
		const response = await fetch(`${base.replace(/\/$/, '')}/v2/serverInfo`, {
			headers: buildGfnBrowserHeaders({...authSession, tokens: {...authSession.tokens, idToken: token}})
		});
		if (!response.ok) {
			return 'GFN-PC';
		}
		const data = await response.json();
		return data?.requestStatus?.serverId || 'GFN-PC';
	} catch (error) {
		return 'GFN-PC';
	}
}

export async function startDeviceLogin ({provider = PROVIDERS[0]} = {}) {
	const data = await fetchJson(`${AUTH_BASE_URL}/device/authorize`, {
		body: toFormBody({
			client_id: STEAM_DECK_CLIENT_ID,
			device_id: getDeviceId(),
			display_name: 'OpenNOW webOS',
			idp_id: DEFAULT_IDP_ID,
			scope: SCOPES
		}),
		headers: buildAuthHeaders(),
		method: 'POST'
	});

	return {
		deviceCode: data.device_code,
		expiresAt: Date.now() + (data.expires_in || 600) * 1000,
		expiresIn: data.expires_in || 600,
		intervalSeconds: Math.max(1, data.interval || 5),
		userCode: data.user_code,
		verificationUri: data.verification_uri_complete || data.verification_uri,
		verificationUriComplete: data.verification_uri_complete,
		provider
	};
}

export async function pollDeviceLogin (challenge) {
	const response = await fetch(`${AUTH_BASE_URL}/token`, {
		body: toFormBody({
			client_id: STEAM_DECK_CLIENT_ID,
			device_code: challenge.deviceCode,
			grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
		}),
		headers: buildAuthHeaders(),
		method: 'POST'
	});
	const data = await response.json().catch(() => null);

	if (!response.ok) {
		if (data?.error === 'authorization_pending') {
			return {complete: false, message: 'Waiting for account approval'};
		}
		if (data?.error === 'slow_down') {
			return {complete: false, message: 'Waiting for NVIDIA sign in'};
		}
		throw new Error(data?.error_description || data?.error || `Device token exchange failed with ${response.status}`);
	}

	if (!data?.access_token && !data?.id_token) {
		return {complete: false, message: 'Waiting for account approval'};
	}

	const provider = challenge.provider || PROVIDERS[0];
	const session = {
		provider: {
			code: provider.code,
			displayName: provider.displayName,
			idpId: provider.idpId,
			priority: provider.priority || 0,
			streamingServiceUrl: provider.streamingServiceUrl || CLOUDMATCH_BASE_URL
		},
		tokens: {
			accessToken: data.access_token,
			idToken: data.id_token || data.access_token,
			refreshToken: data.refresh_token,
			clientToken: data.client_token,
			expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
			authClientId: STEAM_DECK_CLIENT_ID
		},
		user: {
			membershipTier: data.membership_tier,
			userId: data.sub || data.user_id
		}
	};
	saveAuthSession(session);
	return {complete: true, session};
}

export async function cancelDeviceLogin () {
	return undefined;
}

export async function fetchCatalog ({authSession = loadAuthSession()} = {}) {
	const token = tokenFromSession(authSession);
	if (!token) {
		throw new Error('Catalog browsing requires an authenticated token.');
	}

	const variables = {
		locale: 'en_US',
		panelNames: ['MAIN'],
		vpcId: await fetchVpcId(authSession)
	};
	const params = new URLSearchParams({
		extensions: JSON.stringify({
			persistedQuery: {
				sha256Hash: '46ec15f267a056e7d5e46e629efa929529e5e7542a4850faece90b9f8fa5f810'
			}
		}),
		requestType: 'panels/MainV2',
		variables: JSON.stringify(variables)
	});

	const data = await fetchJson(`${CATALOG_BASE_URL}/graphql?${params.toString()}`, {
		headers: {
			...buildGfnBrowserHeaders(authSession),
			'Content-Type': 'application/graphql'
		}
	});

	const entries = (data?.data?.panels || [])
		.flatMap((panel) => panel.sections || [])
		.flatMap((section) => section.items || [])
		.filter((item) => item.__typename === 'GameItem' && item.app)
		.map((item) => item.app);
	return entries.map(normalizeGame);
}

export async function discoverRegions ({authSession = loadAuthSession()} = {}) {
	const token = tokenFromSession(authSession);
	if (!token) throw new Error('Sign in before discovering regions.');
	const base = authSession?.provider?.streamingServiceUrl || DEFAULT_STREAMING_BASE_URL;
	const response = await fetchJson(`${base.replace(/\/$/, '')}/v2/serverInfo`, {headers: buildGfnBrowserHeaders(authSession)});
	return regionEntries(response).map((region) => ({...region, url: region.url.endsWith('/') ? region.url : `${region.url}/`}));
}

export async function pollSession ({authSession = loadAuthSession(), session, settings} = {}) {
	if (!session?.sessionId) throw new Error('Session is missing an id.');
	const base = session.streamingBaseUrl || settings?.region || authSession?.provider?.streamingServiceUrl || DEFAULT_STREAMING_BASE_URL;
	const data = await fetchJson(`${base.replace(/\/$/, '')}/v2/session/${encodeURIComponent(session.sessionId)}`, {
		headers: buildGfnHeaders(authSession)
	});
	return normalizeSession(data, base, session.appId);
}

export async function stopSession ({authSession = loadAuthSession(), session, settings} = {}) {
	if (!session?.sessionId) return null;
	const base = session.streamingBaseUrl || settings?.region || authSession?.provider?.streamingServiceUrl || DEFAULT_STREAMING_BASE_URL;
	const response = await fetch(`${base.replace(/\/$/, '')}/v2/session/${encodeURIComponent(session.sessionId)}`, {
		headers: buildGfnHeaders(authSession),
		method: 'DELETE'
	});
	if (!response.ok && response.status !== 404) throw new Error(`Session cleanup failed with ${response.status}`);
	savePendingAllocation(null);
	return {sessionId: session.sessionId, stopped: true};
}

export async function recoverPendingAllocation ({authSession = loadAuthSession(), settings} = {}) {
	const pending = loadPendingAllocation();
	if (!pending) return {recovered: false};
	const bases = [...new Set([pending.streamingBaseUrl, settings?.region, authSession?.provider?.streamingServiceUrl].filter(Boolean))];
	for (const base of bases) {
		const response = await fetch(`${base.replace(/\/$/, '')}/v2/session`, {headers: buildGfnHeaders(authSession)});
		if (!response.ok) continue;
		const data = await response.json().catch(() => null);
		const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
		const matches = sessions.filter((session) => String(session.sessionId || '') === String(pending.sessionId || '') || String(session.sessionRequestData?.appId || '') === String(pending.appId || ''));
		for (const session of matches) await stopSession({authSession, session: normalizeSession({session}, base, pending.appId), settings});
	}
	savePendingAllocation(null);
	return {recovered: true};
}

export async function createSession ({authSession = loadAuthSession(), game, settings}) {
	if (!tokenFromSession(authSession)) {
		throw new Error('Sign in before launching a game.');
	}
	const pending = loadPendingAllocation();
	if (pending && pending.providerIdpId === authSession.provider?.idpId && pending.deviceId === getDeviceId()) {
		throw new Error('A previous session allocation needs recovery before starting another game.');
	}

	const token = tokenFromSession(authSession);
	const {bitDepth, chromaFormat} = colorQualityValues(settings.colorQuality);
	const {height, width} = parseResolution(settings.resolution);
	const deviceId = getDeviceId();
	const fps = settings.fps || 60;
	const payload = {
		sessionRequestData: {
			appId: Number(game.launchAppId || game.id) || game.launchAppId || game.id,
			internalTitle: null,
			availableSupportedControllers: [2],
			preferredController: 2,
			networkTestSessionId: null,
			parentSessionId: null,
			clientIdentification: 'GFN-PC',
			deviceHashId: deviceId,
			clientVersion: '30.0',
			sdkVersion: '2.0',
			streamerVersion: '14',
			clientPlatformName: 'browser',
			clientRequestMonitorSettings: [{
				displayData: {},
				dpi: 0,
				framesPerSecond: fps,
				heightInPixels: height,
				hdr10PlusGamingData: null,
				monitorId: 0,
				positionX: 0,
				positionY: 0,
				sdrHdrMode: 0,
				widthInPixels: width
			}],
			useOps: true,
			audioMode: 2,
			metaData: [
				{key: 'SubSessionId', value: getClientId()},
				{key: 'wssignaling', value: '1'},
				{key: 'GSStreamerType', value: 'WebRTC'},
				{key: 'networkType', value: 'Unknown'},
				{key: 'ClientImeSupport', value: '0'},
				{key: 'clientPhysicalResolution', value: JSON.stringify({horizontalPixels: width, verticalPixels: height})},
				{key: 'surroundAudioInfo', value: '2'}
			],
			sdrHdrMode: 0,
			clientDisplayHdrCapabilities: null,
			surroundAudioInfo: 0,
			remoteControllersBitmap: 0,
			clientTimezoneOffset: -new Date().getTimezoneOffset() * 60 * 1000,
			enhancedStreamMode: 0,
			appLaunchMode: 2,
			secureRTSPSupported: false,
			partnerCustomData: null,
			accountLinked: true,
			enablePersistingInGameSettings: false,
			userAge: 26,
			requestedStreamingFeatures: {
				reflex: fps >= 120,
				bitDepth,
				cloudGsync: Boolean(settings.enableCloudGsync),
				enabledL4S: Boolean(settings.enableL4S),
				supportedHidDevices: 0,
				profile: 0,
				fallbackToLogicalResolution: false,
				chromaFormat,
				prefilterMode: 0,
				prefilterSharpness: 0,
				prefilterNoiseReduction: 0,
				hudStreamingMode: 0,
				mouseMovementFlags: 0,
				trueHdr: false,
				hidDevices: null
			}
		}
	};

	const base = settings.region?.trim() || authSession.provider?.streamingServiceUrl || DEFAULT_STREAMING_BASE_URL;
	savePendingAllocation({appId: String(game.launchAppId || game.id), createdAt: Date.now(), deviceId, providerIdpId: authSession.provider?.idpId, streamingBaseUrl: base});
	let data;
	try {
		data = await fetchJson(`${base.replace(/\/$/, '')}/v2/session`, {
			body: JSON.stringify(payload),
			headers: buildGfnHeaders({...authSession, tokens: {...authSession.tokens, idToken: token}}),
			method: 'POST'
		});
	} catch (error) {
		throw new Error(`${error.message} A previous allocation may need recovery before retrying.`);
	}

	const session = normalizeSession(data, base, String(game.launchAppId || game.id));
	savePendingAllocation(null);
	return session;
}
