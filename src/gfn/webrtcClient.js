import {createSignalingSocket} from './signaling';

export function createWebRtcClient ({session, videoElement}) {
	let peerConnection;
	let signalingSocket;
	let resolveConnection;
	let rejectConnection;
	const connectionPromise = new Promise((resolve, reject) => { resolveConnection = resolve; rejectConnection = reject; });

	const send = (message) => {
		if (signalingSocket?.readyState === WebSocket.OPEN) signalingSocket.send(JSON.stringify(message));
	};

	const parseMessage = (event) => {
		try { return typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch (error) { return null; }
	};

	return {
		async connect () {
			if (!session?.signalingUrl) {
				throw new Error('Session is missing signaling information.');
			}

			peerConnection = new window.RTCPeerConnection({iceServers: session.iceServers || []});

			peerConnection.ontrack = (event) => {
				if (videoElement && event.streams[0]) {
					videoElement.srcObject = event.streams[0];
				}
			};
			peerConnection.onicecandidate = (event) => {
				if (event.candidate) send({type: 'candidate', candidate: event.candidate});
			};
			peerConnection.onconnectionstatechange = () => {
				if (peerConnection.connectionState === 'connected') resolveConnection();
				if (['failed', 'closed', 'disconnected'].includes(peerConnection.connectionState)) rejectConnection(new Error(`WebRTC connection ${peerConnection.connectionState}`));
			};

			signalingSocket = createSignalingSocket({
				sessionId: session.sessionId,
				signalingUrl: session.signalingUrl
			});
			signalingSocket.onmessage = async (event) => {
				const message = parseMessage(event);
				const description = message?.sdp ? message : message?.data?.sdp ? message.data : null;
				const candidate = message?.candidate || message?.data?.candidate;
				try {
					if (description && description.type) {
						await peerConnection.setRemoteDescription(new window.RTCSessionDescription({type: description.type, sdp: description.sdp}));
						if (description.type === 'offer') {
							const answer = await peerConnection.createAnswer();
							await peerConnection.setLocalDescription(answer);
							send({type: 'answer', sdp: answer.sdp});
						}
					}
					if (candidate) await peerConnection.addIceCandidate(new window.RTCIceCandidate(candidate));
				} catch (error) { rejectConnection(error); }
			};
			signalingSocket.onerror = () => rejectConnection(new Error('Signaling connection failed.'));
			signalingSocket.onopen = () => send({type: 'client_ready', sessionId: session.sessionId});
			await new Promise((resolve, reject) => {
				signalingSocket.addEventListener('open', resolve, {once: true});
				signalingSocket.addEventListener('error', () => reject(new Error('Signaling connection failed.')), {once: true});
			});
			return connectionPromise;
		},

		disconnect () {
			if (signalingSocket) {
				signalingSocket.close();
				signalingSocket = null;
			}

			if (peerConnection) {
				peerConnection.ontrack = null;
				peerConnection.close();
				peerConnection = null;
			}
		}
	};
}
