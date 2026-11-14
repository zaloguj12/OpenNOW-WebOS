/**
 * GeForce NOW API Client for webOS Native Application (ES5 Compatible with Fetch Polyfill)
 */

// Fetch Polyfill using XMLHttpRequest for older WebKit TV engines
if (!window.fetch) {
  window.fetch = function(url, options) {
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      options = options || {};
      xhr.open(options.method || "GET", url);
      
      if (options.headers) {
        for (var key in options.headers) {
          if (options.headers.hasOwnProperty(key)) {
            try {
              // Wrap in try-catch to prevent older WebKit security exceptions for forbidden headers
              xhr.setRequestHeader(key, options.headers[key]);
            } catch (e) {
              console.warn("Could not set header: " + key, e);
            }
          }
        }
      }
      
      xhr.onload = function() {
        var responseText = xhr.responseText;
        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          text: function() { return Promise.resolve(responseText); },
          json: function() { 
            return new Promise(function(res, rej) {
              try {
                res(JSON.parse(responseText));
              } catch (e) {
                console.error("JSON Parse Error! Raw response snippet:", responseText.substring(0, 200) + "...");
                console.error("Error details:", e.message);
                rej(e);
              }
            });
          }
        });
      };
      
      xhr.onerror = function() {
        reject(new Error("Network request failed"));
      };
      
      xhr.send(options.body || null);
    });
  };
}

var STEAM_DECK_CLIENT_ID = "q61ddeJrVt7O90Nl-P-N7I36yctih4Ml6FyXLrb6j-U";
var STEAM_DECK_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; Steam Deck) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
var SCOPES = "openid consent email tk_client age";
var LCARS_CLIENT_ID = "ec7e38d4-03af-4b58-b131-cfb0495903ab";
var GFN_CLIENT_VERSION = "2.0.80.173";
var GFN_WINDOWS_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 NVIDIACEFClient/HEAD/debb5919f6 GFN-PC/2.0.80.173";

var SERVICE_URLS_ENDPOINT = "https://pcs.geforcenow.com/v1/serviceUrls";
var TOKEN_ENDPOINT = "https://login.nvidia.com/token";
var DEVICE_AUTHORIZE_ENDPOINT = "https://login.nvidia.com/device/authorize";
var LCARS_CDN_GRAPHQL_URL = "https://games.geforce.com/graphql";
var DEFAULT_CLOUDMATCH_BASE_URL = "https://prod.cloudmatchbeta.nvidiagrid.net/";
var DEFAULT_IDP_ID = "PDiAhv2kJTFeQ7WOPqiQ2tRZ7lGhR2X11dXvM4TZSxg";

var GAME_SECTION_QUERY = "\nquery GetGameSection($vpcId: String!, $locale: String!, $panelNames: [String]!) {\n  panels(vpcId: $vpcId, language: $locale, names: $panelNames) {\n    id\n    name\n    sections {\n      id\n      title\n      items {\n        __typename\n        ...minimalGameFields\n      }\n    }\n  }\n}\nfragment minimalGameFields on GameItem {\n  app {\n    id\n    images {\n      TV_BANNER\n      HERO_IMAGE\n    }\n    title\n    variants {\n      id\n      shortName\n      appStore\n      supportedControls\n    }\n  } \n}";

function GfnClient() {
  this.token = localStorage.getItem("gfn_token") || null;
  this.clientToken = localStorage.getItem("gfn_client_token") || null;
  this.session = JSON.parse(localStorage.getItem("gfn_session") || "null");
}

GfnClient.prototype.generateDeviceId = function() {
  var id = localStorage.getItem("opennow_device_id");
  if (!id) {
    id = "webos-" + Math.floor(Math.random() * 1e16).toString(16) + "-" + Math.floor(Math.random() * 1e16).toString(16);
    localStorage.setItem("opennow_device_id", id);
  }
  return id;
};

GfnClient.prototype.randomHuId = function() {
  return Date.now().toString(16) + Math.random().toString(16).slice(2);
};

GfnClient.prototype.getLoginProviders = function() {
  return fetch(SERVICE_URLS_ENDPOINT, {
    headers: {
      Accept: "application/json",
      "User-Agent": GFN_WINDOWS_USER_AGENT,
    },
  }).then(function(response) {
    if (!response.ok) throw new Error("Status " + response.status);
    return response.json();
  }).then(function(payload) {
    var endpoints = (payload.gfnServiceInfo && payload.gfnServiceInfo.gfnServiceEndpoints) || [];
    return endpoints.map(function(entry) {
      var url = entry.streamingServiceUrl || "";
      // ES5 endsWith alternative
      if (url && url.slice(-1) !== "/") {
        url = url + "/";
      }
      return {
        idpId: entry.idpId,
        code: entry.loginProviderCode,
        displayName: entry.loginProviderCode === "BPC" ? "bro.game" : entry.loginProviderDisplayName,
        streamingServiceUrl: url,
        priority: entry.loginProviderPriority || 0,
      };
    }).sort(function(a, b) {
      return a.priority - b.priority;
    });
  }).catch(function(e) {
    console.warn("Failed to fetch GFN providers, falling back to default:", e);
    return [{
      idpId: DEFAULT_IDP_ID,
      code: "NVIDIA",
      displayName: "NVIDIA",
      streamingServiceUrl: DEFAULT_CLOUDMATCH_BASE_URL,
      priority: 0,
    }];
  });
};

GfnClient.prototype.startDeviceLogin = function(providerIdpId) {
  var deviceId = this.generateDeviceId();
  
  var body = "client_id=" + encodeURIComponent(STEAM_DECK_CLIENT_ID) +
             "&scope=" + encodeURIComponent(SCOPES) +
             "&device_id=" + encodeURIComponent(deviceId) +
             "&display_name=" + encodeURIComponent("OpenNOW") +
             "&idp_id=" + encodeURIComponent(providerIdpId);

  return fetch(DEVICE_AUTHORIZE_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      Origin: "https://play.geforcenow.com",
      Referer: "https://play.geforcenow.com/",
      "User-Agent": STEAM_DECK_USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-device-id": deviceId,
      "nv-client-id": STEAM_DECK_CLIENT_ID,
      "nv-client-streamer": "WEBRTC",
      "nv-client-type": "BROWSER",
      "nv-client-platform-name": "browser",
      "nv-browser-type": "CHROME",
      "nv-device-os": "STEAMOS",
      "nv-device-type": "CONSOLE",
      "nv-device-model": "STEAMDECK",
      "nv-device-make": "VALVE",
    },
    body: body,
  }).then(function(response) {
    if (!response.ok) {
      throw new Error("Device auth start failed (" + response.status + ")");
    }
    return response.json();
  }).then(function(payload) {
    return {
      deviceCode: payload.device_code,
      userCode: payload.user_code,
      verificationUri: payload.verification_uri,
      verificationUriComplete: payload.verification_uri_complete,
      expiresAt: Date.now() + (payload.expires_in || 600) * 1000,
      intervalSeconds: Math.max(1, payload.interval || 5),
    };
  });
};

GfnClient.prototype.pollDeviceLogin = function(deviceCode) {
  var body = "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code" +
             "&device_code=" + encodeURIComponent(deviceCode) +
             "&client_id=" + encodeURIComponent(STEAM_DECK_CLIENT_ID);

  var self = this;
  return fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      Origin: "https://play.geforcenow.com",
      Referer: "https://play.geforcenow.com/",
      "User-Agent": STEAM_DECK_USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: body,
  }).then(function(response) {
    return response.json().catch(function() { return null; }).then(function(payload) {
      if (!response.ok) {
        if (payload && payload.error) {
          return { status: "pending", error: payload.error };
        }
        return { status: "error", error: "Polling failed" };
      }

      if (payload && (payload.id_token || payload.access_token)) {
        self.token = payload.id_token || payload.access_token;
        self.clientToken = payload.client_token || self.token;
        localStorage.setItem("gfn_token", self.token);
        localStorage.setItem("gfn_client_token", self.clientToken);
        return { status: "authorized", token: self.token };
      }

      return { status: "pending" };
    });
  });
};

GfnClient.prototype.getVpcId = function(streamingServiceUrl) {
  var base = streamingServiceUrl || DEFAULT_CLOUDMATCH_BASE_URL;
  // ES5 endsWith alternative
  if (base.slice(-1) !== "/") {
    base = base + "/";
  }
  var serverInfoUrl = base + "v2/serverInfo";

  var headers = {
    Accept: "application/json",
    Authorization: "GFNJWT " + this.token,
    "nv-client-id": LCARS_CLIENT_ID,
    "nv-client-type": "NATIVE",
    "nv-client-version": GFN_CLIENT_VERSION,
    "nv-client-streamer": "NVIDIA-CLASSIC",
    "nv-device-os": "LINUX",
    "nv-device-type": "DESKTOP",
    "User-Agent": GFN_WINDOWS_USER_AGENT,
  };

  return fetch(serverInfoUrl, { headers: headers }).then(function(response) {
    if (!response.ok) return "GFN-PC";
    return response.json().then(function(payload) {
      return (payload.requestStatus && payload.requestStatus.serverId) || "GFN-PC";
    });
  }).catch(function() {
    return "GFN-PC";
  });
};

GfnClient.prototype.fetchMainGames = function(streamingServiceUrl) {
  var self = this;
  return this.getVpcId(streamingServiceUrl).then(function(vpcId) {
    var variables = {
      vpcId: vpcId,
      locale: "en_US",
      panelNames: ["MAIN"],
    };

    var params = "extensions=" + encodeURIComponent(JSON.stringify({
        persistedQuery: { sha256Hash: "46ec15f267a056e7d5e46e629efa929529e5e7542a4850faece90b9f8fa5f810" },
      })) +
      "&huId=" + encodeURIComponent(self.randomHuId()) +
      "&variables=" + encodeURIComponent(JSON.stringify(variables)) +
      "&requestType=" + encodeURIComponent("panels/MainV2");

    var headers = {
      Accept: "application/json, text/plain, */*",
      Origin: "https://play.geforcenow.com",
      Referer: "https://play.geforcenow.com/",
      Authorization: "GFNJWT " + self.token,
      "nv-client-id": LCARS_CLIENT_ID,
      "nv-client-type": "NATIVE",
      "nv-client-version": GFN_CLIENT_VERSION,
      "nv-client-streamer": "NVIDIA-CLASSIC",
      "nv-device-os": "LINUX",
      "nv-device-type": "DESKTOP",
      "nv-device-make": "UNKNOWN",
      "nv-device-model": "UNKNOWN",
      "nv-browser-type": "CHROME",
      "User-Agent": GFN_WINDOWS_USER_AGENT,
    };

    var url = LCARS_CDN_GRAPHQL_URL + "?" + params;
    return fetch(url, { headers: headers }).then(function(response) {
      if (response.status === 400) {
        var queryParams = params + "&query=" + encodeURIComponent(GAME_SECTION_QUERY);
        return fetch(LCARS_CDN_GRAPHQL_URL + "?" + queryParams, { headers: headers });
      }
      return response;
    }).then(function(response) {
      if (!response.ok) {
        throw new Error("GraphQL query failed with status " + response.status);
      }
      return response.json();
    }).then(function(payload) {
      if (payload.errors && payload.errors.length > 0) {
        throw new Error(payload.errors[0].message);
      }

      var games = [];
      var panels = payload.data ? payload.data.panels || [] : [];
      for (var i = 0; i < panels.length; i++) {
        var panel = panels[i];
        var sections = panel.sections || [];
        for (var j = 0; j < sections.length; j++) {
          var section = sections[j];
          var items = section.items || [];
          for (var k = 0; k < items.length; k++) {
            var item = items[k];
            if (item.__typename === "GameItem" && item.app) {
              var banner = (item.app.images && (item.app.images.TV_BANNER || item.app.images.HERO_IMAGE)) || "";
              games.push({
                id: item.app.id,
                title: item.app.title,
                banner: banner,
                variants: item.app.variants || [],
              });
            }
          }
        }
      }
      return games;
    });
  });
};

GfnClient.prototype.fetchLibraryGames = function(streamingServiceUrl) {
  var self = this;
  return this.getVpcId(streamingServiceUrl).then(function(vpcId) {
    var variables = {
      vpcId: vpcId,
      locale: "en_US",
      panelNames: ["LIBRARY"],
    };

    var params = "extensions=" + encodeURIComponent(JSON.stringify({
        persistedQuery: { sha256Hash: "46ec15f267a056e7d5e46e629efa929529e5e7542a4850faece90b9f8fa5f810" },
      })) +
      "&huId=" + encodeURIComponent(self.randomHuId()) +
      "&variables=" + encodeURIComponent(JSON.stringify(variables)) +
      "&requestType=" + encodeURIComponent("panels/Library");

    var headers = {
      Accept: "application/json, text/plain, */*",
      Origin: "https://play.geforcenow.com",
      Referer: "https://play.geforcenow.com/",
      Authorization: "GFNJWT " + self.token,
      "nv-client-id": LCARS_CLIENT_ID,
      "nv-client-type": "NATIVE",
      "nv-client-version": GFN_CLIENT_VERSION,
      "nv-client-streamer": "NVIDIA-CLASSIC",
      "nv-device-os": "LINUX",
      "nv-device-type": "DESKTOP",
      "nv-device-make": "UNKNOWN",
      "nv-device-model": "UNKNOWN",
      "nv-browser-type": "CHROME",
      "User-Agent": GFN_WINDOWS_USER_AGENT,
    };

    var url = LCARS_CDN_GRAPHQL_URL + "?" + params;
    return fetch(url, { headers: headers }).then(function(response) {
      if (response.status === 400) {
        var queryParams = params + "&query=" + encodeURIComponent(GAME_SECTION_QUERY);
        return fetch(LCARS_CDN_GRAPHQL_URL + "?" + queryParams, { headers: headers });
      }
      return response;
    }).then(function(response) {
      if (!response.ok) {
        throw new Error("GraphQL query failed with status " + response.status);
      }
      return response.json();
    }).then(function(payload) {
      if (payload.errors && payload.errors.length > 0) {
        throw new Error(payload.errors[0].message);
      }

      var games = [];
      var panels = payload.data ? payload.data.panels || [] : [];
      for (var i = 0; i < panels.length; i++) {
        var panel = panels[i];
        var sections = panel.sections || [];
        for (var j = 0; j < sections.length; j++) {
          var section = sections[j];
          var items = section.items || [];
          for (var k = 0; k < items.length; k++) {
            var item = items[k];
            if (item.__typename === "GameItem" && item.app) {
              var banner = (item.app.images && (item.app.images.TV_BANNER || item.app.images.HERO_IMAGE)) || "";
              games.push({
                id: item.app.id,
                title: item.app.title,
                banner: banner,
                variants: item.app.variants || [],
              });
            }
          }
        }
      }
      return games;
    });
  });
};


GfnClient.prototype.createSession = function(appId, streamingServiceUrl) {
  var deviceId = this.generateDeviceId();
  var clientId = "webos-client-" + Math.floor(Math.random() * 1e16).toString(16);
  var base = streamingServiceUrl || DEFAULT_CLOUDMATCH_BASE_URL;

  var body = {
    sessionRequestData: {
      appId: appId.toString(),
      internalTitle: null,
      availableSupportedControllers: [],
      networkTestSessionId: null,
      parentSessionId: null,
      clientIdentification: "GFN-PC",
      deviceHashId: deviceId,
      clientVersion: "30.0",
      sdkVersion: "1.0",
      streamerVersion: 1,
      clientPlatformName: "windows",
      clientRequestMonitorSettings: [
        {
          monitorId: 0,
          positionX: 0,
          positionY: 0,
          widthInPixels: 1920,
          heightInPixels: 1080,
          white: true
        }
      ]
    }
  };
  
  // Truncated for structure
  var fullSessionBody = {
    sessionRequestData: {
      appId: appId.toString(),
      internalTitle: null,
      availableSupportedControllers: [],
      networkTestSessionId: null,
      parentSessionId: null,
      clientIdentification: "GFN-PC",
      deviceHashId: deviceId,
      clientVersion: "30.0",
      sdkVersion: "1.0",
      streamerVersion: 1,
      clientPlatformName: "windows",
      clientRequestMonitorSettings: [
        {
          monitorId: 0,
          positionX: 0,
          positionY: 0,
          widthInPixels: 1920,
          heightInPixels: 1080,
          framesPerSecond: 60,
          sdrHdrMode: 0,
          displayData: {},
          hdr10PlusGamingData: null,
          dpi: 0,
        }
      ],
      useOps: true,
      audioMode: 2,
      metaData: [
        { key: "SubSessionId", value: "webos-sub-" + Math.floor(Math.random() * 1e16).toString(16) },
        { key: "wssignaling", value: "1" },
        { key: "GSStreamerType", value: "WebRTC" },
        { key: "networkType", value: "Unknown" },
        { key: "ClientImeSupport", value: "0" },
        { key: "clientPhysicalResolution", value: JSON.stringify({ horizontalPixels: 1920, verticalPixels: 1080 }) },
        { key: "surroundAudioInfo", value: "2" }
      ],
      sdrHdrMode: 0,
      clientDisplayHdrCapabilities: null,
      surroundAudioInfo: 0,
      remoteControllersBitmap: 0,
      clientTimezoneOffset: -new Date().getTimezoneOffset() * 60 * 1000,
      enhancedStreamMode: 1,
      appLaunchMode: 0,
      secureRTSPSupported: false,
      partnerCustomData: "",
      accountLinked: true,
      enablePersistingInGameSettings: false,
      userAge: 26,
      requestedStreamingFeatures: {
        reflex: false,
        bitDepth: 0,
        cloudGsync: false,
        enabledL4S: false,
        supportedHidDevices: 0,
        profile: 0,
        fallbackToLogicalResolution: false,
        chromaFormat: 0,
        prefilterMode: 0,
        prefilterSharpness: 0,
        prefilterNoiseReduction: 0,
        hudStreamingMode: 0,
      }
    }
  };

  var url = base.replace(/\/$/, "") + "/v2/session?keyboardLayout=en_US&languageCode=en_US";
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "GFNJWT " + this.token,
      "User-Agent": GFN_WINDOWS_USER_AGENT,
      "nv-browser-type": "CHROME",
      "nv-client-id": clientId,
      "nv-client-streamer": "NVIDIA-CLASSIC",
      "nv-client-type": "NATIVE",
      "nv-client-version": GFN_CLIENT_VERSION,
      "nv-device-make": "UNKNOWN",
      "nv-device-model": "UNKNOWN",
      "nv-device-os": "LINUX",
      "nv-device-type": "DESKTOP",
      "x-device-id": deviceId,
      Origin: "https://play.geforcenow.com",
      Referer: "https://play.geforcenow.com/",
    },
    body: JSON.stringify(fullSessionBody),
  }).then(function(response) {
    return response.text().then(function(text) {
      var payload;
      try {
        payload = JSON.parse(text);
      } catch (e) {
        if (!response.ok) {
          console.error("Session API Error Body:", text.substring(0, 200));
          throw new Error("Session creation failed (" + response.status + ")");
        } else {
          throw new Error("JSON Parse Error: " + e.message);
        }
      }
      
      if (!response.ok) {
        // If the server returns 409 or similar, it might still give us the active session!
        if (payload && payload.session && payload.session.sessionId) {
          console.log("Resuming existing active session from error response...");
          return payload;
        }
        console.error("Session API Error Body:", text.substring(0, 200));
        var errDesc = (payload.requestStatus && payload.requestStatus.statusDescription) || response.status;
        throw new Error("Launch error: " + errDesc);
      }
      return payload;
    });
  }).then(function(payload) {
    var sessionId = (payload.session && payload.session.sessionId) || null;
    var rawStatus = (payload.session && payload.session.status !== undefined) ? payload.session.status : null;
    var status = "queue";
    if (rawStatus === 2 || rawStatus === 3) {
      status = "active";
    } else if (rawStatus === 5 || rawStatus === 8) {
      status = "failed";
    }
    
    var serverIp = (payload.session && payload.session.connectionInfo && payload.session.connectionInfo.address) || null;
    var signalingUrl = (payload.session && payload.session.connectionInfo && payload.session.connectionInfo.signalingUrl) || null;
    
    // Crucial: Use the regional server assigned to this session for polling, instead of the global matchmaker
    var sessionIp = (payload.session && payload.session.sessionControlInfo && payload.session.sessionControlInfo.ip) || null;
    var pollBase = sessionIp ? "https://" + sessionIp : base;

    return {
      sessionId: sessionId,
      status: status,
      streamingBaseUrl: pollBase,
      clientId: clientId,
      deviceId: deviceId,
      serverIp: serverIp,
      signalingUrl: signalingUrl,
    };
  });
};

GfnClient.prototype.pollSession = function(sessionId, streamingServiceUrl, clientId, deviceId) {
  var base = streamingServiceUrl || DEFAULT_CLOUDMATCH_BASE_URL;
  var url = base.replace(/\/$/, "") + "/v2/session/" + sessionId;
  
  return fetch(url, {
    method: "GET",
    headers: {
      Authorization: "GFNJWT " + this.token,
      "User-Agent": GFN_WINDOWS_USER_AGENT,
      "nv-browser-type": "CHROME",
      "nv-client-id": clientId,
      "nv-client-streamer": "NVIDIA-CLASSIC",
      "nv-client-type": "NATIVE",
      "nv-client-version": GFN_CLIENT_VERSION,
      "nv-device-make": "UNKNOWN",
      "nv-device-model": "UNKNOWN",
      "nv-device-os": "LINUX",
      "nv-device-type": "DESKTOP",
      "x-device-id": deviceId,
    },
  }).then(function(response) {
    return response.text().then(function(text) {
      var payload;
      try {
        payload = JSON.parse(text);
      } catch (e) {
        if (!response.ok) {
          console.error("Poll API Error:", text.substring(0, 200));
          throw new Error("Session polling failed (" + response.status + ")");
        } else {
          throw new Error("JSON Parse Error: " + e.message);
        }
      }
      
      if (!response.ok) {
        if (payload && payload.session) {
          return payload;
        }
        console.error("Poll API Error:", text.substring(0, 200));
        throw new Error("Session polling failed (" + response.status + ")");
      }
      return payload;
    });
  }).then(function(payload) {
    var sessId = (payload.session && payload.session.sessionId) || null;
    var rawStatus = (payload.session && payload.session.status !== undefined) ? payload.session.status : null;
    var status = "queue";
    if (rawStatus === 2 || rawStatus === 3) {
      status = "active";
    } else if (rawStatus === 5 || rawStatus === 8) {
      status = "failed";
    }
    
    var serverIp = (payload.session && payload.session.connectionInfo && payload.session.connectionInfo.address) || null;
    var signalingUrl = (payload.session && payload.session.connectionInfo && payload.session.connectionInfo.signalingUrl) || null;
    var appLaunchMode = (payload.session && payload.session.sessionRequestData && payload.session.sessionRequestData.appLaunchMode) || 0;
    var queuePosition = (payload.session && payload.session.statusDetails && payload.session.statusDetails.queuePosition) || 0;

    return {
      sessionId: sessId,
      status: status,
      serverIp: serverIp,
      signalingUrl: signalingUrl,
      appLaunchMode: appLaunchMode,
      queuePosition: queuePosition,
    };
  });
};

GfnClient.prototype.logout = function() {
  this.token = null;
  this.clientToken = null;
  this.session = null;
  localStorage.removeItem("gfn_token");
  localStorage.removeItem("gfn_client_token");
  localStorage.removeItem("gfn_session");
};

window.gfnClient = new GfnClient();
