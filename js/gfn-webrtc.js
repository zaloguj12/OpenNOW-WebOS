/**
 * GFN WebRTC Stream Coordinator and Signaling Client for webOS Native App (ES5 Version)
 */

var signalingWs = null;
var heartbeatInterval = null;
var ackCounter = 0;
var localPeerId = 0;
var remotePeerId = 1;
var peerName = "peer-" + Math.floor(Math.random() * 10000000000);
var signalingListeners = [];
var activeRtcClient = null;

function nextAckId() {
  ackCounter += 1;
  return ackCounter;
}

function sendSignalingMessage(payload) {
  if (signalingWs && signalingWs.readyState === WebSocket.OPEN) {
    signalingWs.send(JSON.stringify(payload));
  }
}

function emitSignalingEvent(event) {
  signalingListeners.forEach(function(listener) {
    try {
      listener(event);
    } catch (e) {
      console.error("Error in signaling listener:", e);
    }
  });
}

function setupHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(function() {
    sendSignalingMessage({ hb: 1 });
  }, 5000);
}

function handleSignalingMessage(text) {
  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return;
  }

  if (parsed.peer_info) {
    if (parsed.peer_info.id !== undefined && parsed.peer_info.name === peerName) {
      localPeerId = parsed.peer_info.id;
      console.log("[Signaling] Local peer ID assigned:", localPeerId);
    }
  }

  if (parsed.ackid !== undefined) {
    var shouldAck = parsed.peer_info && parsed.peer_info.id !== localPeerId;
    if (shouldAck) {
      sendSignalingMessage({ ack: parsed.ackid });
    }
  }

  if (parsed.hb) {
    sendSignalingMessage({ hb: 1 });
    return;
  }

  if (parsed.error === "peerRemoved") {
    console.log("[Signaling] Peer removed");
    emitSignalingEvent({ type: "disconnected", reason: "peerRemoved" });
    return;
  }

  if (!parsed.peer_msg || !parsed.peer_msg.msg) {
    return;
  }

  if (parsed.peer_msg.from !== undefined) {
    remotePeerId = parsed.peer_msg.from;
  }

  var peerMessage = parsed.peer_msg.msg.trim();
  if (peerMessage === "BYE") {
    console.log("[Signaling] BYE received");
    emitSignalingEvent({ type: "disconnected", reason: "BYE" });
    return;
  }

  var peerPayload;
  try {
    peerPayload = JSON.parse(peerMessage);
  } catch (e) {
    return;
  }

  if (peerPayload.type === "offer" && typeof peerPayload.sdp === "string") {
    console.log("[Signaling] Received SDP Offer from GFN server");
    emitSignalingEvent({ type: "offer", sdp: peerPayload.sdp });
  } else if (typeof peerPayload.candidate === "string") {
    emitSignalingEvent({
      type: "remote-ice",
      candidate: {
        candidate: peerPayload.candidate,
        sdpMid: peerPayload.sdpMid,
        sdpMLineIndex: peerPayload.sdpMLineIndex !== undefined ? peerPayload.sdpMLineIndex : 0,
        usernameFragment: peerPayload.usernameFragment
      }
    });
  }
}

// Define the global window.openNow object that GfnWebRtcClient uses internally
window.openNow = {
  onSignalingEvent: function(listener) {
    signalingListeners.push(listener);
    return function() {
      signalingListeners = signalingListeners.filter(function(l) {
        return l !== listener;
      });
    };
  },
  sendAnswer: function(payload) {
    console.log("[Signaling] Sending SDP Answer");
    var msgBody = {
      type: "answer",
      sdp: payload.sdp
    };
    if (payload.nvstSdp) {
      msgBody.nvstSdp = payload.nvstSdp;
    }
    sendSignalingMessage({
      peer_msg: {
        from: localPeerId,
        to: remotePeerId,
        msg: JSON.stringify(msgBody)
      },
      ackid: nextAckId()
    });
    return Promise.resolve();
  },
  sendIceCandidate: function(candidate) {
    // ES5 compatible string contains check
    if (candidate.candidate.indexOf(" transport-protocol tcp") !== -1 || candidate.candidate.indexOf(" tcptype ") !== -1) {
      return Promise.resolve();
    }
    sendSignalingMessage({
      peer_msg: {
        from: localPeerId,
        to: remotePeerId,
        msg: JSON.stringify({
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
          usernameFragment: candidate.usernameFragment
        })
      },
      ackid: nextAckId()
    });
    return Promise.resolve();
  },
  requestKeyframe: function(payload) {
    sendSignalingMessage({
      peer_msg: {
        from: localPeerId,
        to: remotePeerId,
        msg: JSON.stringify({
          type: "request_keyframe",
          reason: payload.reason,
          backlogFrames: payload.backlogFrames,
          attempt: payload.attempt
        })
      },
      ackid: nextAckId()
    });
    return Promise.resolve();
  },
  setFullscreen: function(val) {
    console.log("[openNow] Fullscreen request:", val);
    return Promise.resolve();
  }
};

/**
 * Connect to GFN Signaling WebSocket
 */
function connectSignaling(signalingServer, sessionId, signalingUrl) {
  return new Promise(function(resolve, reject) {
    // ES5 contains check instead of includes
    var fallbackHost = signalingServer.indexOf(":") !== -1 ? signalingServer : signalingServer + ":443";
    var trimmedSignalingUrl = signalingUrl ? signalingUrl.trim() : null;
    var baseUrl = trimmedSignalingUrl || "wss://" + fallbackHost + "/nvst/";
    
    // Ensure wss: protocol and build URL manually without modern URL class properties
    var urlStr = baseUrl.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
    if (urlStr.indexOf("ws:") !== 0 && urlStr.indexOf("wss:") !== 0) {
      urlStr = "wss://" + urlStr;
    }
    
    var baseWithoutTrailingSlash = urlStr.replace(/\/$/, "");
    var separator = baseWithoutTrailingSlash.indexOf("?") !== -1 ? "&" : "?";
    var signInUrlStr = baseWithoutTrailingSlash + "/sign_in" + separator +
                       "peer_id=" + encodeURIComponent(peerName) +
                       "&version=2" +
                       "&peer_role=1" +
                       "&pairing_id=" + encodeURIComponent(sessionId);

    console.log("[Signaling] Connecting to:", signInUrlStr);
    var ws = new WebSocket(signInUrlStr, "x-nv-sessionid." + sessionId);
    signalingWs = ws;

    ws.onopen = function() {
      console.log("[Signaling] Connected, sending peer info");
      sendSignalingMessage({
        ackid: nextAckId(),
        peer_info: {
          browser: "Chrome",
          browserVersion: "131",
          connected: true,
          id: 0,
          name: peerName,
          peerRole: 0,
          resolution: "1920x1080",
          version: 2,
        }
      });
      setupHeartbeat();
      emitSignalingEvent({ type: "connected" });
      resolve();
    };

    ws.onmessage = function(event) {
      handleSignalingMessage(event.data);
    };

    ws.onerror = function(error) {
      console.error("[Signaling] Socket error:", error);
      emitSignalingEvent({ type: "error", message: "WebSocket error" });
      reject(error);
    };

    ws.onclose = function(event) {
      console.log("[Signaling] Connection closed:", event.reason);
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      emitSignalingEvent({ type: "disconnected", reason: event.reason || "socket closed" });
    };
  });
}

/**
 * Starts GFN Streaming session
 * @param {HTMLVideoElement} videoElement The video DOM element to render to
 * @param {Object} session GFN Session info returned from createSession/pollSession
 * @param {Object} settings Custom stream preferences
 * @param {Function} onStateChange Connection state callback
 */
window.startGfnStream = function(videoElement, session, settings, onStateChange) {
  if (activeRtcClient) {
    try {
      activeRtcClient.destroy();
    } catch(e) {}
    activeRtcClient = null;
  }
  if (signalingWs) {
    signalingWs.close();
    signalingWs = null;
  }

  // Regex host extractor instead of new URL() base parsing
  var hostMatch = session.streamingBaseUrl.match(/^https?:\/\/([^/]+)/);
  var host = hostMatch ? hostMatch[1] : session.streamingBaseUrl;

  return connectSignaling(host, session.sessionId, session.signalingUrl).then(function() {
    var maxBitrate = (settings && settings.maxBitrateKbps) ? settings.maxBitrateKbps : 20000;
    var defaultSettings = {
      codec: "H264",
      colorQuality: "8bit_420",
      resolution: "1920x1080",
      fps: 60,
      maxBitrateKbps: maxBitrate,
      enableCloudGsync: false,
      enableL4S: false
    };

    var client = new window.GfnWebRtcClient({
      videoElement: videoElement,
      session: session,
      settings: Object.assign({}, defaultSettings, settings),
      onPeerConnectionStateChange: function(state) {
        console.log("[WebRTC] Peer Connection State:", state);
        if (onStateChange) onStateChange(state);
      }
    });

    activeRtcClient = client;
    return client.connect();
  });
};

window.stopGfnStream = function() {
  if (activeRtcClient) {
    try {
      activeRtcClient.destroy();
    } catch(e) {}
    activeRtcClient = null;
  }
  if (signalingWs) {
    signalingWs.close();
    signalingWs = null;
  }
};
