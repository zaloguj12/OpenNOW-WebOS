export function createSignalingSocket ({sessionId, signalingUrl}) {
	if (!signalingUrl) {
		throw new Error('Missing GFN signaling URL.');
	}

	const signInUrl = new URL(signalingUrl);
	signInUrl.protocol = 'wss:';
	signInUrl.pathname = `${signInUrl.pathname.replace(/\/?$/, '/') }sign_in`;
	signInUrl.search = '';
	signInUrl.searchParams.set('peer_id', `webos-${Math.floor(Math.random() * 10000000000)}`);
	signInUrl.searchParams.set('version', '2');
	signInUrl.searchParams.set('peer_role', '1');
	signInUrl.searchParams.set('pairing_id', sessionId);

	const protocols = sessionId ? [`x-nv-sessionid.${sessionId}`] : undefined;
	return new WebSocket(signInUrl.toString(), protocols);
}
