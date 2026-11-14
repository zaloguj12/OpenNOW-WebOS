/**
 * Main Application Orchestration for OpenNOW webOS Smart TV (ES5 Version)
 */

document.addEventListener("DOMContentLoaded", function() {
  var loginView = document.getElementById("view-login");
  var libraryView = document.getElementById("view-library");
  var storeView = document.getElementById("view-store");
  var settingsView = document.getElementById("view-settings");
  
  var navLibrary = document.getElementById("nav-library");
  var navStore = document.getElementById("nav-store");
  var navSettings = document.getElementById("nav-settings");
  var navLogout = document.getElementById("nav-logout");
  
  var providerSelect = document.getElementById("provider-select");
  var providerDropdown = document.getElementById("provider-dropdown");
  var codeText = document.getElementById("code-text");
  
  var gameGrid = document.getElementById("game-grid");
  var storeGrid = document.getElementById("store-grid");
  var matchmakerOverlay = document.getElementById("matchmaker-overlay");
  var matchmakerStatus = document.getElementById("matchmaker-status");
  var matchmakerDetail = document.getElementById("matchmaker-detail");
  var playerContainer = document.getElementById("player-container");
  var streamVideo = document.getElementById("stream-video");
  var escapeMenu = document.getElementById("escape-menu");
  var btnCloseEscape = document.getElementById("btn-close-escape");
  var btnExitStream = document.getElementById("btn-exit-stream");
  
  var profileName = document.getElementById("profile-name");
  
  var currentView = "login";
  var activeSessionPollTimer = null;
  var activeLoginPollTimer = null;
  var savedProvider = localStorage.getItem("gfn_provider");
  var selectedProvider = savedProvider ? JSON.parse(savedProvider) : null;
  var gameCatalog = [];
  var gamesLoaded = false;
  var storeLoaded = false;

  // Stream Settings
  var streamSettings = {
    codec: localStorage.getItem("gfn_setting_codec") || "H264",
    resolution: localStorage.getItem("gfn_setting_res") || "1920x1080",
    maxBitrateKbps: parseInt(localStorage.getItem("gfn_setting_bitrate") || "25000", 10),
  };

  function switchView(viewName) {
    currentView = viewName;
    
    loginView.classList.remove("active-view");
    libraryView.classList.remove("active-view");
    if (storeView) storeView.classList.remove("active-view");
    settingsView.classList.remove("active-view");
    
    navLibrary.classList.remove("active");
    if (navStore) navStore.classList.remove("active");
    navSettings.classList.remove("active");

    var header = document.querySelector(".top-header");
    var footer = document.querySelector(".footer-bar");
    if (viewName === "login") {
      loginView.classList.add("active-view");
      if (header) header.classList.add("hidden");
      if (footer) footer.classList.add("hidden");
    } else {
      if (header) header.classList.remove("hidden");
      if (footer) footer.classList.remove("hidden");
      if (viewName === "library") {
        libraryView.classList.add("active-view");
        navLibrary.classList.add("active");
        loadLibrary();
      } else if (viewName === "store") {
        if (storeView) storeView.classList.add("active-view");
        if (navStore) navStore.classList.add("active");
        loadStore();
      } else if (viewName === "settings") {
        settingsView.classList.add("active-view");
        navSettings.classList.add("active");
        renderSettingsOptions();
      }
    }
    
    // Automatically reset focus to first focusable element in new view
    setTimeout(function() {
      if (window.spatialNavigation) {
        window.spatialNavigation.resetFocus();
      }
    }, 100);
  }

  // Back Key Handler
  window.handleBackKey = function() {
    if (playerContainer.style.display === "block") {
      if (escapeMenu.classList.contains("active")) {
        escapeMenu.classList.remove("active");
        if (window.spatialNavigation) {
          window.spatialNavigation.focusElement(document.getElementById("stream-video"));
        }
      } else {
        escapeMenu.classList.add("active");
        setTimeout(function() {
          if (window.spatialNavigation) {
            window.spatialNavigation.focusElement(btnExitStream);
          }
        }, 100);
      }
    } else if (currentView !== "library") {
      switchView("library");
    } else {
      if (window.webOS && window.webOS.platformBack) {
        window.webOS.platformBack();
      } else {
        console.log("System Back Triggered");
      }
    }
  };

  // Render game catalog UI (Reusable for library & store grids)
  function renderCatalog(games, targetGrid) {
    var grid = targetGrid || gameGrid;
    grid.innerHTML = "";
    if (games.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #9ba8b9; padding: 40px; background: rgba(255,255,255,0.02); border-radius:12px;">No games available. Make sure your accounts are linked on GeForce NOW.</div>';
      return;
    }

    // Update game count label dynamically
    if (grid === gameGrid) {
      var countLabel = document.getElementById("library-count");
      if (countLabel) countLabel.innerText = games.length + " games";
    }

    games.forEach(function(game) {
      var card = document.createElement("div");
      card.className = "game-card focusable";
      card.setAttribute("tabindex", "0");
      
      // Determine variant store platform (Steam, Xbox, Epic, etc.)
      var variantStore = "Steam";
      if (game.variants && game.variants.length > 0) {
        var storeName = game.variants[0].appStore || "";
        if (storeName.indexOf("STEAM") !== -1) variantStore = "Steam";
        else if (storeName.indexOf("EPIC") !== -1) variantStore = "Epic";
        else if (storeName.indexOf("XBOX") !== -1 || storeName.indexOf("MSSTORE") !== -1) variantStore = "Xbox";
        else if (storeName.indexOf("UBISOFT") !== -1) variantStore = "Ubisoft";
      }

      var storeBadgeHtml = "";
      if (variantStore === "Steam") {
        storeBadgeHtml = '<div class="store-badge steam"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.625 3.87 10.339 9.073 11.66l.812-2.812a3.834 3.834 0 0 1-.953-1.127l-3.328-1.373c-1.328-.548-1.578-2.327-.414-3.197.88-.658 2.298-.446 2.846.883l1.373 3.328c.4.97 1.258 1.488 2.215 1.488.587 0 1.18-.196 1.636-.61 1.173-1.066.862-2.955-.572-3.547l-4.225-1.745a7.994 7.994 0 0 1 3.535-9.336 7.992 7.992 0 0 1 10.158 1.634c4.611 5.158 4.1 12.984-1.138 17.518-5.237 4.533-13.111 3.99-17.653-1.213A12.01 12.01 0 0 1 12 .297z"/></svg></div>';
      } else {
        storeBadgeHtml = '<div class="store-badge other" style="font-family:sans-serif; text-transform:uppercase;">' + variantStore.slice(0, 1) + '</div>';
      }

      card.innerHTML = '\n        <div class="game-cover-container">\n          <img class="game-cover" src="' + (game.banner || 'logo.png') + '" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';" alt="' + game.title + '" />\n          <div class="game-cover-fallback" style="display: none; background: linear-gradient(135deg, #162c0b 0%, #0d1a2f 100%); width: 100%; height: 100%; align-items: center; justify-content: center; padding: 20px; text-align: center;">\n            <span style="font-size: 16px; font-weight: bold; color: #76b900;">' + game.title + '</span>\n          </div>\n          ' + storeBadgeHtml + '\n          <div class="game-card-overlay">\n            <span class="game-card-title">' + game.title + '</span>\n          </div>\n        </div>\n      ';

      card.addEventListener("click", function() {
        launchGame(game);
      });
      grid.appendChild(card);
    });
  }

  // Fetch and show GFN Library (Owned Games)
  function loadLibrary() {
    profileName.innerText = "Authorized";
    if (gamesLoaded) return;
    
    // Display visual loading spinner
    gameGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #76b900; padding: 40px;"><div class="spinner" style="width:40px; height:40px; border-width:3px; margin: 0 auto 15px auto;"></div>Loading GFN Library...</div>';
    
    var providerUrl = selectedProvider ? selectedProvider.streamingServiceUrl : null;
    window.gfnClient.fetchLibraryGames(providerUrl).then(function(games) {
      gamesLoaded = true;
      gameCatalog = games;
      renderCatalog(games, gameGrid);
      if (window.spatialNavigation) {
        window.spatialNavigation.resetFocus();
      }
    }).catch(function(e) {
      console.error("Failed to load GFN Library:", e);
      
      // Auto-recover from invalid/expired tokens by logging out and prompting login
      if (e.message.indexOf("401") !== -1) {
        window.gfnClient.logout();
        initAuthView();
        return;
      }
      
      // Draw error info directly in the games catalog list
      gameGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #eb5757; padding: 40px; background: rgba(235, 87, 87, 0.1); border: 1px solid rgba(235, 87, 87, 0.3); border-radius: 12px; max-width:800px; margin: 0 auto;">' +
                           '<div style="font-size:22px; font-weight:bold; margin-bottom:12px;">Failed to load library</div>' +
                           '<div style="font-size:16px; color:#9ba8b9; margin-bottom:20px; font-family:monospace;">' + e.message + '</div>' +
                           '<button class="nav-item focusable" style="margin: 0 auto; color: white; border: 1px solid rgba(255,255,255,0.3); background:rgba(255,255,255,0.05); padding:10px 24px; border-radius:8px;" onclick="window.location.reload()">Retry Connection</button>' +
                           '</div>';
      if (window.spatialNavigation) {
        window.spatialNavigation.resetFocus();
      }
    });
  }

  // Fetch and show GFN Store (Browse all games)
  function loadStore() {
    if (storeLoaded) return;
    
    // Display GFN Store loading state
    storeGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #76b900; padding: 40px;"><div class="spinner" style="width:40px; height:40px; border-width:3px; margin: 0 auto 15px auto;"></div>Loading GFN Store Catalog...</div>';
    
    var providerUrl = selectedProvider ? selectedProvider.streamingServiceUrl : null;
    window.gfnClient.fetchMainGames(providerUrl).then(function(games) {
      storeLoaded = true;
      renderCatalog(games, storeGrid);
      if (window.spatialNavigation) {
        window.spatialNavigation.resetFocus();
      }
    }).catch(function(e) {
      console.error("Failed to load GFN Store:", e);
      
      if (e.message.indexOf("401") !== -1) {
        window.gfnClient.logout();
        initAuthView();
        return;
      }
      
      storeGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #eb5757; padding: 40px; background: rgba(235, 87, 87, 0.1); border: 1px solid rgba(235, 87, 87, 0.3); border-radius: 12px; max-width:800px; margin: 0 auto;">' +
                            '<div style="font-size:22px; font-weight:bold; margin-bottom:12px;">Failed to load store catalog</div>' +
                            '<div style="font-size:16px; color:#9ba8b9; margin-bottom:20px; font-family:monospace;">' + e.message + '</div>' +
                            '<button class="nav-item focusable" style="margin: 0 auto; color: white; border: 1px solid rgba(255,255,255,0.3); background:rgba(255,255,255,0.05); padding:10px 24px; border-radius:8px;" onclick="window.location.reload()">Retry Connection</button>' +
                            '</div>';
      if (window.spatialNavigation) {
        window.spatialNavigation.resetFocus();
      }
    });
  }

  // Select GFN Login Provider
  function initAuthView() {
    switchView("login");
    window.gfnClient.getLoginProviders().then(function(providers) {
      selectedProvider = providers[0];
      providerSelect.querySelector("span").innerText = selectedProvider.displayName;
      
      providerDropdown.innerHTML = "";
      providers.forEach(function(p) {
        var btn = document.createElement("button");
        btn.className = "dropdown-item focusable";
        btn.setAttribute("tabindex", "0");
        btn.innerText = p.displayName;
        btn.addEventListener("click", function() {
          selectedProvider = p;
          localStorage.setItem("gfn_provider", JSON.stringify(p));
          providerSelect.querySelector("span").innerText = p.displayName;
          providerDropdown.classList.remove("show");
          if (window.spatialNavigation) {
            window.spatialNavigation.focusElement(providerSelect);
          }
          startDeviceLoginFlow();
        });
        providerDropdown.appendChild(btn);
      });
      
      if (window.spatialNavigation) {
        window.spatialNavigation.resetFocus();
      }
      
      startDeviceLoginFlow();
    }).catch(function(e) {
      console.error("Provider initialization failed:", e);
    });
  }

  function startDeviceLoginFlow() {
    if (!selectedProvider) return;
    if (activeLoginPollTimer) {
      clearInterval(activeLoginPollTimer);
      activeLoginPollTimer = null;
    }
    
    codeText.innerText = "------";
    var qrContainer = document.getElementById("qr-code-container");
    qrContainer.innerHTML = '<div style="color: #9ba8b9; padding:20px; font-size:12px;">Generating...</div>';

    window.gfnClient.startDeviceLogin(selectedProvider.idpId).then(function(challenge) {
      codeText.innerText = challenge.userCode;
      
      // Draw offline QR code on canvas
      qrContainer.innerHTML = "";
      try {
        new QRCode(qrContainer, {
          text: challenge.verificationUriComplete,
          width: 180,
          height: 180,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
      } catch (err) {
        console.error("QRCode rendering failed:", err);
        qrContainer.innerHTML = '<div style="color: #eb5757; font-size:12px;">QR Fail</div>';
      }

      var pollInterval = challenge.intervalSeconds * 1000;
      activeLoginPollTimer = setInterval(function() {
        if (Date.now() > challenge.expiresAt) {
          clearInterval(activeLoginPollTimer);
          activeLoginPollTimer = null;
          startDeviceLoginFlow();
          return;
        }
        
        window.gfnClient.pollDeviceLogin(challenge.deviceCode).then(function(pollResult) {
          if (pollResult.status === "authorized") {
            clearInterval(activeLoginPollTimer);
            activeLoginPollTimer = null;
            switchView("library");
          }
        }).catch(function(e) {
          console.warn("Polling error:", e);
        });
      }, pollInterval);
    }).catch(function(e) {
      console.error("Failed to start login challenge:", e);
      codeText.innerText = "ERROR";
      qrContainer.innerHTML = '<div style="color:#eb5757; font-size:12px; padding:20px;">Connection failed</div>';
    });
  }

  // Allocate and launch a streaming game session
  function launchGame(game) {
    if (!game.variants || game.variants.length === 0) {
      alert("No launch variant found for this game.");
      return;
    }
    
    var variant = game.variants[0];
    var appId = variant.id;
    var providerUrl = selectedProvider ? selectedProvider.streamingServiceUrl : null;
    
    matchmakerStatus.innerText = "Matching Server...";
    matchmakerDetail.innerText = "Requesting gaming machine from GeForce NOW...";
    matchmakerOverlay.style.display = "flex";
    
    if (window.spatialNavigation) {
      window.spatialNavigation.focusElement(matchmakerOverlay);
    }

    window.gfnClient.createSession(appId, providerUrl).then(function(sessionInfo) {
      pollStreamSession(sessionInfo);
    }).catch(function(e) {
      console.error("Session creation error:", e);
      matchmakerStatus.innerText = "Error";
      matchmakerDetail.innerText = "Launch failed: " + e.message;
      setTimeout(function() {
        matchmakerOverlay.style.display = "none";
        switchView("library");
      }, 3000);
    });
  }

  function pollStreamSession(sessionInfo) {
    var interval = 3000;
    
    activeSessionPollTimer = setInterval(function() {
      window.gfnClient.pollSession(
        sessionInfo.sessionId,
        sessionInfo.streamingBaseUrl,
        sessionInfo.clientId,
        sessionInfo.deviceId
      ).then(function(statusInfo) {
        if (statusInfo.status === "active") {
          clearInterval(activeSessionPollTimer);
          activeSessionPollTimer = null;
          
          matchmakerStatus.innerText = "Establishing Stream...";
          matchmakerDetail.innerText = "Connecting to peer RTC channel...";
          
          startPlayout(sessionInfo, statusInfo);
        } else if (statusInfo.status === "queue") {
          matchmakerStatus.innerText = "Queue Position: " + statusInfo.queuePosition;
          matchmakerDetail.innerText = "Waiting for an available gaming slot...";
        } else if (statusInfo.status === "failed" || statusInfo.status === "terminated") {
          clearInterval(activeSessionPollTimer);
          activeSessionPollTimer = null;
          matchmakerStatus.innerText = "Session Closed";
          matchmakerDetail.innerText = "NVIDIA session closed: " + statusInfo.status;
          setTimeout(function() {
            matchmakerOverlay.style.display = "none";
            switchView("library");
          }, 3000);
        }
      }).catch(function(e) {
        console.warn("Poll session failed:", e);
        matchmakerStatus.innerText = "Error";
        matchmakerDetail.innerText = "Polling failed: " + e.message;
        clearInterval(activeSessionPollTimer);
        activeSessionPollTimer = null;
        setTimeout(function() {
          matchmakerOverlay.style.display = "none";
          switchView("library");
        }, 3000);
      });
    }, interval);
  }

  function startPlayout(sessionInfo, statusInfo) {
    playerContainer.style.display = "block";
    
    // Configure remote signaling session object
    var session = {
      streamingBaseUrl: sessionInfo.streamingBaseUrl,
      sessionId: sessionInfo.sessionId,
      signalingUrl: statusInfo.signalingUrl
    };
    
    window.startGfnStream(streamVideo, session, streamSettings, function(state) {
      console.log("[OpenNOW App] RTC State change:", state);
      if (state === "connected") {
        matchmakerOverlay.style.display = "none";
        if (window.spatialNavigation) {
          window.spatialNavigation.focusElement(streamVideo);
        }
      } else if (state === "failed" || state === "closed") {
        exitPlayout();
      }
    }).catch(function(e) {
      console.error("RTC Playout establishment failed:", e);
      matchmakerStatus.innerText = "Streaming Error";
      matchmakerDetail.innerText = "Error: " + e.message;
      matchmakerOverlay.style.display = "flex";
      setTimeout(function() {
        exitPlayout();
      }, 3000);
    });
  }

  function exitPlayout() {
    if (activeSessionPollTimer) {
      clearInterval(activeSessionPollTimer);
      activeSessionPollTimer = null;
    }
    window.stopGfnStream();
    playerContainer.style.display = "none";
    escapeMenu.classList.remove("active");
    switchView("library");
  }

  // Settings view rendering and triggers (ES5 Compatible Loops)
  function renderSettingsOptions() {
    var codecBtns = Array.prototype.slice.call(document.querySelectorAll(".codec-btn"));
    codecBtns.forEach(function(btn) {
      btn.classList.toggle("selected", btn.dataset.val === streamSettings.codec);
    });

    var resBtns = Array.prototype.slice.call(document.querySelectorAll(".res-btn"));
    resBtns.forEach(function(btn) {
      btn.classList.toggle("selected", btn.dataset.val === streamSettings.resolution);
    });

    var bitrateBtns = Array.prototype.slice.call(document.querySelectorAll(".bitrate-btn"));
    bitrateBtns.forEach(function(btn) {
      btn.classList.toggle("selected", parseInt(btn.dataset.val, 10) === streamSettings.maxBitrateKbps);
    });
  }

  // Setup settings click handlers
  var codecBtns = Array.prototype.slice.call(document.querySelectorAll(".codec-btn"));
  codecBtns.forEach(function(btn) {
    btn.addEventListener("click", function() {
      streamSettings.codec = btn.dataset.val;
      localStorage.setItem("gfn_setting_codec", streamSettings.codec);
      renderSettingsOptions();
    });
  });

  var resBtns = Array.prototype.slice.call(document.querySelectorAll(".res-btn"));
  resBtns.forEach(function(btn) {
    btn.addEventListener("click", function() {
      streamSettings.resolution = btn.dataset.val;
      localStorage.setItem("gfn_setting_res", streamSettings.resolution);
      renderSettingsOptions();
    });
  });

  var bitrateBtns = Array.prototype.slice.call(document.querySelectorAll(".bitrate-btn"));
  bitrateBtns.forEach(function(btn) {
    btn.addEventListener("click", function() {
      streamSettings.maxBitrateKbps = parseInt(btn.dataset.val, 10);
      localStorage.setItem("gfn_setting_bitrate", streamSettings.maxBitrateKbps.toString());
      renderSettingsOptions();
    });
  });

  // Sidebar Button triggers
  navLibrary.addEventListener("click", function() { switchView("library"); });
  if (navStore) navStore.addEventListener("click", function() { switchView("store"); });
  navSettings.addEventListener("click", function() { switchView("settings"); });
  navLogout.addEventListener("click", function() {
    if (confirm("Are you sure you want to sign out?")) {
      window.gfnClient.logout();
      gamesLoaded = false;
      storeLoaded = false;
      gameCatalog = [];
      initAuthView();
    }
  });

  // Login dropdown trigger
  providerSelect.addEventListener("click", function(e) {
    e.stopPropagation();
    providerDropdown.classList.toggle("show");
    if (providerDropdown.classList.contains("show")) {
      setTimeout(function() {
        var items = Array.prototype.slice.call(providerDropdown.querySelectorAll(".dropdown-item"));
        if (items.length > 0 && window.spatialNavigation) {
          window.spatialNavigation.focusElement(items[0]);
        }
      }, 100);
    }
  });

  document.addEventListener("click", function() {
    providerDropdown.classList.remove("show");
  });

  // Escape menu overlays
  btnCloseEscape.addEventListener("click", function() {
    escapeMenu.classList.remove("active");
    if (window.spatialNavigation) {
      window.spatialNavigation.focusElement(streamVideo);
    }
  });

  btnExitStream.addEventListener("click", function() {
    if (confirm("End current GeForce NOW session?")) {
      exitPlayout();
    } else {
      escapeMenu.classList.remove("active");
      if (window.spatialNavigation) {
        window.spatialNavigation.focusElement(streamVideo);
      }
    }
  });

  // Check login credentials on startup
  if (window.gfnClient.token) {
    switchView("library");
  } else {
    initAuthView();
  }
});
