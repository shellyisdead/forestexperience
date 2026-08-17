// main.js — FMOD integration (DEBUG BUILD)
// Includes: verbose badending handler, creation interceptor, start wrapper,
// super-scanner, parameter watcher, and defensive fallbacks.
// Replace your existing main.js with this file for debugging. Remove debug
// helpers when issue is resolved.

var FMOD = {};
FMOD.window = window;
FMOD.preRun = prerun;
FMOD.onRuntimeInitialized = main;
FMOD.INITIAL_MEMORY = 64 * 1024 * 1024;
FMODModule(FMOD);

var gSystem, gSystemCore;
var ambienceInstance = null, stepInstance = null;
var animalsID = null, rainID = null, inoutID = null, hitID = null, safezoneID = null, endingID = null, distanceParamID = null;

var totalMonsters = 4;
var resolvedMonsters = 0;
var currentMonster = null;
var creatureInstance = null;

// ---------- CONFIGURAZIONE ----------
const CREATURE_SWING_WINDOW_START_MS = 4000; // 4.5s
const CREATURE_SWING_WINDOW_END_MS   = 6000; // 6.0s
const CREATURE_RESTART_DELAY_MS      = 5000; // 5s dopo creaturelose
const CREATURE_TOTAL_TIMEOUT_MS      = 6000; // fallback: durata massima stimata dell'evento creature
 
// legacy arrays / active spawn
window.monsterEvents = window.monsterEvents || [];
window.activeSpawn = window.activeSpawn || null;
window.resolvedMonsters = window.resolvedMonsters || 0;

// ---------- STATO GLOBALE DELLA SEQUENZA ----------
window._creatureFlow = window._creatureFlow || {
  running: false,
  startTs: 0,
  swingWindowOpen: false,
  swingWindowOpenTimer: null,
  swingWindowCloseTimer: null,
  endTimer: null,
  restartTimer: null,
  playerKilled: false,
  instance: null
};

// main.js helpers (paste before ui.js loads)

// 1) playEventOnce(path)
window.playEventOnce = function(path) {
  try {
    if (!window.gSystem || typeof window.gSystem.getEvent !== "function") return null;
    var desc = {};
    var r = window.gSystem.getEvent(path, desc);
    if (r !== window.FMOD.OK || !desc || !desc.val) return null;
    var instObj = {};
    var cr = desc.val.createInstance(instObj);
    if (cr !== window.FMOD.OK || !instObj.val) return null;
    var inst = instObj.val;
    try { inst.start(); try { window.gSystem.update(); } catch(e){} } catch(e){}
    return inst;
  } catch(e) { console.warn("playEventOnce error", e); return null; }
};

// 2) safeCreateAndStart(path)
window.safeCreateAndStart = function(path) {
  try { return window.playEventOnce ? window.playEventOnce(path) : null; }
  catch(e) { console.warn("safeCreateAndStart error", e); return null; }
};

// 3) onPlayerSwingSequence default (override in main if needed)
window.onPlayerSwingSequence = function() {
  try {
    const now = Date.now();
    console.log("onPlayerSwingSequence called at", now);

    const f = window._creatureFlow;
    if (!f) return false;

    console.log("running:", f.running, "window:", f.swingWindowOpen);

    if (!f.running) return false;
    if (!f.swingWindowOpen) { console.log("HIT outside window"); return false; }

    if (f._hitHandled) {
      console.log("Hit already handled");
      return false;
    }

    // --- HIT ACCETTATO ---
    f._hitHandled = true;
    f.playerKilled = true;
    f._ignoreStopCallback = true;
    f.swingWindowOpen = false;

    console.log("HIT accepted — resolving creature");

    // cancella timers
    clearCreatureFlowTimers();

    // play creaturelose
    try { playEventOnce("event:/creaturelose"); } catch(e){}

    // stop instance
    try { stopAndReleaseInstance(f.instance); } catch(e){}
    f.instance = null;

    f.running = false;

    // --- RESTART ---
    if (f.restartTimer) clearTimeout(f.restartTimer);

    f.restartTimer = setTimeout(() => {
      console.log("Restarting creature sequence after delay");

      f.running = false;
      f.swingWindowOpen = false;
      f._hitHandled = false;
      f._ignoreStopCallback = false;
      f.playerKilled = false;
      f.instance = null;

      clearCreatureFlowTimers();
      startCreatureSequence();

    }, 5000);

    return true;

  } catch(e){
    console.warn("onPlayerSwingSequence error", e);
    return false;
  }
};



// --- Helpers for FMOD parameters ---
function safeGetParameter(name) {
  try {
    if (!gSystem) return { ok: false };
    var out = {};
    if (typeof gSystem.getParameterByName === "function") {
      try {
        const r = gSystem.getParameterByName(name, out, 0);
        if (r === FMOD.OK && out && typeof out.val !== "undefined") return { ok: true, val: out.val };
      } catch (e) {
        try {
          const r2 = gSystem.getParameterByName(name, out);
          if (r2 === FMOD.OK && out && typeof out.val !== "undefined") return { ok: true, val: out.val };
        } catch (e2) {}
      }
    }
    if (typeof window[name + "ID"] !== "undefined" && typeof gSystem.getParameterByID === "function") {
      var out2 = {};
      try { gSystem.getParameterByID(window[name + "ID"], out2, 0); if (out2 && typeof out2.val !== "undefined") return { ok: true, val: out2.val }; } catch(e){}
    }
  } catch (e) {}
  return { ok: false };
}

function safeSetParameter(name, value) {
  try {
    if (!gSystem) return false;
    if (typeof gSystem.setParameterByName === "function") {
      try { gSystem.setParameterByName(name, value, false); try { gSystem.update(); } catch(e){}; return true; }
      catch (e) {
        try { gSystem.setParameterByName(name, value); try { gSystem.update(); } catch(e){}; return true; } catch(e2){}
      }
    }
    if (typeof window[name + "ID"] !== "undefined" && typeof gSystem.setParameterByID === "function") {
      try { gSystem.setParameterByID(window[name + "ID"], value, false); try { gSystem.update(); } catch(e){}; return true; } catch(e){}
    }
  } catch (e) {}
  return false;
}

function CHECK(result, label) {
  if (result !== FMOD.OK) {
    console.error("FMOD ERROR in " + label + ": " + (FMOD.ErrorString ? FMOD.ErrorString(result) : result));
    throw new Error("FMOD error: " + label);
  }
}

// --- prerun / main ---
function prerun() {
  try {
    FMOD.FS_createPreloadedFile("/", "Master.bank", "banks/Master.bank", true, false);
    FMOD.FS_createPreloadedFile("/", "Master.strings.bank", "banks/Master.strings.bank", true, false);
    FMOD.FS_createPreloadedFile("/", "Ambience.bank", "banks/Ambience.bank", true, false);
    FMOD.FS_createPreloadedFile("/", "Character.bank", "banks/Character.bank", true, false);
    console.log("prerun: banks preloaded");
  } catch(e){ console.warn("prerun error", e); }
}

function main() {
  console.log("main: initializing FMOD");
  try {
    var out = {};
    CHECK(FMOD.Studio_System_Create(out), "Studio_System_Create");
    gSystem = out.val;

// --- A: Minimal createInstance interceptor (install immediately after gSystem created) ---
(function installBadendingCreationInterceptorNow() {
  try {
    if (!gSystem) return;
    if (gSystem.__badendingInterceptorInstalled) return;
    gSystem.__badendingInterceptorInstalled = true;

    var origGetEvent = gSystem.getEvent && gSystem.getEvent.bind(gSystem);
    if (!origGetEvent) { console.warn("Interceptor: gSystem.getEvent not available"); return; }

    gSystem.getEvent = function(path, outDesc) {
      var r = origGetEvent(path, outDesc);
      try {
        // outDesc.val è l'EventDescription binding; wrappiamo createInstance su di esso
        if (outDesc && outDesc.val && typeof outDesc.val.createInstance === "function") {
          var descObj = outDesc.val;
          if (!descObj.__createInstanceWrapped) {
            descObj.__createInstanceWrapped = true;
            var origCreate = descObj.createInstance.bind(descObj);
            descObj.createInstance = function(instOut) {
              var cr = origCreate(instOut);
              try {
                var inst = instOut && instOut.val;
                // se il path contiene "badending" attacca handler non-verboso
                if (inst && String(path || "").indexOf("badending") !== -1) {
                  try {
                    // attach a STARTED handler that triggers the UI
                    if (typeof inst.setCallback === "function") {
                      inst.setCallback(function(evType) {
                        try {
                          // FMOD.STUDIO_EVENT_CALLBACK_STARTED may be numeric; trigger on any start-like event
                          if (evType === FMOD.STUDIO_EVENT_CALLBACK_STARTED || evType === 1 || evType === 0) {
                            try { handleEndingIsOne(); } catch(e){ console.warn("handleEndingIsOne threw", e); }
                          }
                        } catch(e){ console.warn("badending instance callback error", e); }
                      }, FMOD.STUDIO_EVENT_CALLBACK_STARTED);
                    } else {
                      // if no setCallback, try to call UI immediately (best-effort)
                      try { handleEndingIsOne(); } catch(e){ console.warn("handleEndingIsOne threw", e); }
                    }
                    window._lastBadEndingInstance = inst;
                  } catch(e){ console.warn("Interceptor attach failed", e); }
                }
              } catch(e){ console.warn("Interceptor post-create processing failed", e); }
              return cr;
            };
          }
        }
      } catch(e){ console.warn("Interceptor inner error", e); }
      return r;
    };

    console.log("Interceptor: installed (badending createInstance watcher)");
  } catch(e){ console.warn("installBadendingCreationInterceptorNow failed", e); }
})();



    var outCore = {};
    CHECK(gSystem.getCoreSystem(outCore), "getCoreSystem");
    gSystemCore = outCore.val;

    CHECK(gSystem.initialize(1024, FMOD.STUDIO_INIT_NORMAL, FMOD.INIT_NORMAL, null), "System.initialize");

    try { gSystemCore.set3DSettings(1.0, 1.0, 1.0); } catch (e) { console.warn("set3DSettings failed", e); }

    // install interceptors early so we catch createInstance calls
    installBadendingCreationInterceptor();
    installStartWrapper();

    setTimeout(initApplication, 300);
    window.setInterval(updateApplication, 20);

    console.log("FMOD main initialized");
  } catch (e) {
    console.error("main init error", e);
  }
}

// ---------- FUNZIONI FMOD DI SUPPORTO (assumono gSystem definito) ----------
function playEventOnce(path) {
  try {
    if (!gSystem) return null;
    var desc = {};
    var r = gSystem.getEvent(path, desc);
    if (r !== FMOD.OK || !desc || !desc.val) return null;
    var instObj = {};
    var cr = desc.val.createInstance(instObj);
    if (cr !== FMOD.OK || !instObj.val) return null;
    var inst = instObj.val;
    try { inst.start(); try { gSystem.update(); } catch(e){} } catch(e){}
    return inst;
  } catch(e) { console.warn("playEventOnce error", e); return null; }
}

function stopAndReleaseInstance(inst) {
  try {
    if (!inst) return;
    // stop con fadeout se disponibile
    try { if (typeof inst.stop === "function") inst.stop(window.FMOD ? window.FMOD.STOP_ALLOWFADEOUT : 0); } catch(e){ console.warn("stop instance failed", e); }
    // release se disponibile (non prima di un breve delay per permettere fadeout)
    try {
      setTimeout(() => {
        try { if (typeof inst.release === "function") inst.release(); } catch(e){ /* non-blocking */ }
      }, 120);
    } catch(e){}
  } catch(e){ console.warn("stopAndReleaseInstance outer error", e); }
}

// --- handleEndingIsOne: UI fade + overlay + redirect ---
function handleEndingIsOne() {
  try {
    if (document.getElementById("deadOverlay")) return;
    console.log("handleEndingIsOne: invoked");

    try {
      if (window._runFloatingInterval) { clearInterval(window._runFloatingInterval); window._runFloatingInterval = null; }
      document.querySelectorAll(".runFloating, .floatingText").forEach(n => { try { if (n.parentNode) n.parentNode.removeChild(n); } catch(e){} });
    } catch(e){ console.warn("cleanup floating texts failed", e); }

    try {
      const container = document.getElementById("actionButtonsContainer") || (window._actionButtons && window._actionButtons.container);
      if (container && container.dataset.fading !== "1") {
        container.dataset.fading = "1";
        container.style.transition = "opacity 800ms ease, transform 800ms ease";
        container.style.opacity = "0";
        container.style.transform = "translateY(12px) scale(0.98)";
        setTimeout(() => { try { if (container.parentNode) container.parentNode.removeChild(container); } catch(e){} }, 900);
      } else {
        try {
          if (window._actionButtons && window._actionButtons.runBtn && window._actionButtons.runBtn.parentNode) window._actionButtons.runBtn.parentNode.removeChild(window._actionButtons.runBtn);
          if (window._actionButtons && window._actionButtons.swingBtn && window._actionButtons.swingBtn.parentNode) window._actionButtons.swingBtn.parentNode.removeChild(window._actionButtons.swingBtn);
        } catch(e){}
      }

      const actionHeader = document.getElementById("actionHeader");
      if (actionHeader) { actionHeader.style.transition = "opacity 400ms ease, transform 400ms ease"; actionHeader.style.opacity = "0"; setTimeout(()=>{ try{ if (actionHeader.parentNode) actionHeader.parentNode.removeChild(actionHeader); }catch(e){} }, 420); }

      const header = document.getElementById("monsterHeader");
      if (header) { header.style.transition = "opacity 700ms ease"; header.style.opacity = "0"; setTimeout(()=>{ try{ if (header.parentNode) header.parentNode.removeChild(header); }catch(e){} }, 800); }

      const drag = document.getElementById("dragMonsterBtn");
      if (drag) { drag.style.transition = "opacity 700ms ease, transform 700ms ease"; drag.style.opacity = "0"; drag.style.transform = "translate(-50%,-40%) scale(0.98)"; setTimeout(()=>{ try{ if (drag.parentNode) drag.parentNode.removeChild(drag); }catch(e){} }, 800); }
    } catch(e){ console.warn("fadeout failed", e); }

    try {
      const overlay = document.createElement("div");
      overlay.id = "deadOverlay";
      overlay.style.position = "fixed";
      overlay.style.left = "0";
      overlay.style.top = "0";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.display = "flex";
      overlay.style.flexDirection = "column";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.zIndex = 15000;
      overlay.style.pointerEvents = "none";
      overlay.style.opacity = "0";
      overlay.style.transition = "opacity 900ms ease";

      const box = document.createElement("div");
      box.style.textAlign = "center";
      box.style.padding = "12px 24px";

      const title = document.createElement("div");
      title.textContent = "you're dead..";
      title.style.color = "#ff2e2e";
      title.style.fontFamily = "Arial, sans-serif";
      title.style.fontWeight = "900";
      title.style.fontSize = "56px";
      title.style.marginBottom = "12px";
      title.style.opacity = "0";
      title.style.transform = "translateY(8px)";
      title.style.transition = "opacity 700ms ease, transform 700ms ease";

      const subtitle = document.createElement("div");
      subtitle.textContent = ".. but here's my portfolio anyway";
      subtitle.style.color = "#ffffff";
      subtitle.style.fontFamily = "Arial, sans-serif";
      subtitle.style.fontWeight = "700";
      subtitle.style.fontSize = "20px";
      subtitle.style.opacity = "0";
      subtitle.style.transform = "translateY(8px)";
      subtitle.style.transition = "opacity 700ms ease 120ms, transform 700ms ease 120ms";

      box.appendChild(title);
      box.appendChild(subtitle);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      setTimeout(() => {
        overlay.style.opacity = "1";
        setTimeout(() => { title.style.opacity = "1"; title.style.transform = "translateY(0)"; }, 80);
        setTimeout(() => { subtitle.style.opacity = "1"; subtitle.style.transform = "translateY(0)"; }, 200);
      }, 120);

      setTimeout(() => {
        overlay.style.opacity = "0";
        title.style.opacity = "0";
        subtitle.style.opacity = "0";
        setTimeout(() => {
          try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch(e){}
          try { window.location.href = "https://www.alessioruscelli.com"; } catch(e){ console.warn("redirect failed", e); }
        }, 900);
      }, 5000);
    } catch(e){ console.warn("deadOverlay error", e); }
  } catch(e) {
    console.warn("handleEndingIsOne error", e);
  }
}

// --- DEBUG: verbose badending detection and helpers ---

// VERBOSE attachBadEndingHandler: log eventType numeric, stack and playback info
function attachBadEndingHandlerVerbose(inst) {
  try {
    if (!inst || typeof inst.setCallback !== "function") { console.warn("attachBadEndingHandlerVerbose: no inst or no setCallback"); return; }
    if (inst.__badEndingHandlerRegisteredVerbose) { console.log("attachBadEndingHandlerVerbose: already registered"); return; }
    inst.__badEndingHandlerRegisteredVerbose = true;

    inst.setCallback(function(eventType, callbackInfo) {
      try {
        console.log("BADENDING CALLBACK numeric eventType =", eventType, "callbackInfo =", callbackInfo, "instance:", inst);
        console.log(new Error("stack trace for callback").stack);

        try { var st = {}; if (typeof inst.getPlaybackState === "function") { inst.getPlaybackState(st); console.log("badending playbackState =", st && st.val); } } catch(e){ console.warn("getPlaybackState failed", e); }
        try { var pos = {}; if (typeof inst.getTimelinePosition === "function") { inst.getTimelinePosition(pos); console.log("badending timelinePosition =", pos && pos.val); } } catch(e){ console.warn("getTimelinePosition failed", e); }

        try { handleEndingIsOne(); console.log("handleEndingIsOne invoked from badending callback"); } catch(e){ console.error("handleEndingIsOne threw", e); }
      } catch(e) { console.warn("badending verbose callback outer error", e); }
    }, /* mask 0 to attempt receiving all callbacks if binding supports it */ 0);
    console.log("attachBadEndingHandlerVerbose: callback registered on instance", inst);
  } catch(e) { console.warn("attachBadEndingHandlerVerbose error", e); }
}

// Standard attach kept for compatibility
function attachBadEndingHandler(inst) {
  try {
    if (!inst || typeof inst.setCallback !== "function") return;
    if (inst.__badEndingHandlerRegistered) return;
    inst.__badEndingHandlerRegistered = true;

    inst.setCallback(function(eventType) {
      try {
        if (eventType === FMOD.STUDIO_EVENT_CALLBACK_STARTED) {
          console.log("DEBUG badending STARTED -> show final screen");
          try { handleEndingIsOne(); } catch(e){ console.warn("handleEndingIsOne failed", e); }
          try { inst.setCallback(null, FMOD.STUDIO_EVENT_CALLBACK_STARTED); } catch(e){}
        }
      } catch(e){ console.warn("badending callback error", e); }
    }, FMOD.STUDIO_EVENT_CALLBACK_STARTED);
  } catch(e) { console.warn("attachBadEndingHandler outer error", e); }
}

// start badending from JS (optional)
window.startBadEndingEvent = function() {
  try {
    var inst = null;
    if (typeof window.safeCreateAndStart === "function") {
      inst = window.safeCreateAndStart("event:/badending");
    } else if (gSystem && typeof gSystem.getEvent === "function") {
      var desc = {};
      var r = gSystem.getEvent("event:/badending", desc);
      if (r === FMOD.OK && desc && desc.val && typeof desc.val.createInstance === "function") {
        var obj = {};
        var cr = desc.val.createInstance(obj);
        if (cr === FMOD.OK && obj.val) {
          inst = obj.val;
          try { if (typeof inst.start === "function") inst.start(); } catch(e){ console.warn("startBadEndingEvent: start threw", e); }
        }
      }
    }
    if (inst) {
      window._lastBadEndingInstance = inst;
      try { attachBadEndingHandlerVerbose(inst); } catch(e){ console.warn("attachBadEndingHandler failed", e); }
    } else {
      console.warn("startBadEndingEvent: could not create badending instance");
    }
    return inst;
  } catch(e) {
    console.warn("startBadEndingEvent error", e);
    return null;
  }
};

// --- Interceptor: wrap gSystem.getEvent / desc.createInstance to catch badending creation early ---
function installBadendingCreationInterceptor() {
  try {
    if (!gSystem) {
      setTimeout(installBadendingCreationInterceptor, 200);
      return;
    }
    if (gSystem.__badendingInterceptorInstalled) return;
    gSystem.__badendingInterceptorInstalled = true;

    var origGetEvent = gSystem.getEvent && gSystem.getEvent.bind(gSystem);
    if (!origGetEvent) { console.warn("installBadendingCreationInterceptor: gSystem.getEvent not available"); return; }

    gSystem.getEvent = function(path, outDesc) {
      try {
        var r = origGetEvent(path, outDesc);
        try {
          if (outDesc && outDesc.val && typeof outDesc.val.createInstance === "function") {
            var descObj = outDesc.val;
            if (!descObj.__createInstanceWrapped) {
              descObj.__createInstanceWrapped = true;
              var origCreate = descObj.createInstance.bind(descObj);
              descObj.createInstance = function(instOut) {
                var cr = origCreate(instOut);
                try {
                  var inst = instOut && instOut.val;
                  console.log("Interceptor: createInstance called for", path, "->", cr, "instance:", inst);
                  try { window.__lastCreatedInstance = inst; } catch(e){}
                  try {
                    if (String(path || "").indexOf("badending") !== -1) {
                      console.log("Interceptor: detected badending createInstance -> attaching verbose handler");
                      try { attachBadEndingHandlerVerbose(inst); } catch(e){ console.warn("attachBadEndingHandlerVerbose failed", e); }
                      try { window._lastBadEndingInstance = inst; } catch(e){}
                    }
                  } catch(e){ console.warn("Interceptor: path check failed", e); }
                } catch(e){ console.warn("Interceptor createInstance post-processing failed", e); }
                return cr;
              };
            }
          }
        } catch(e){ console.warn("installBadendingCreationInterceptor inner wrap failed", e); }
        return r;
      } catch(e) {
        console.warn("Wrapped getEvent error for path", path, e);
        return origGetEvent(path, outDesc);
      }
    };

    console.log("installBadendingCreationInterceptor: installed");
  } catch(e) { console.warn("installBadendingCreationInterceptor failed", e); }
}

// --- Start wrapper: logs every start() call on instances (install early) ---
function installStartWrapper() {
  try {
    // try to find a sample instance; if not available, retry shortly
    var sample = window.__lastCreatedInstance || window._lastCreatureInstance || window._lastBadEndingInstance;
    if (!sample) {
      setTimeout(installStartWrapper, 200);
      return;
    }
    var proto = sample.constructor && sample.constructor.prototype;
    if (!proto || proto.__wrapped_start) return;
    proto.__wrapped_start = true;
    var origStart = proto.start;
    proto.start = function() {
      try {
        console.log("WRAP start called on instance", this, "stack:", new Error().stack);
      } catch(e){}
      try { return origStart.apply(this, arguments); } catch(e){ try { return origStart.call(this); } catch(e2){ console.warn("origStart call failed", e2); } }
    };
    console.log("installStartWrapper: start wrapper installed on instance prototype");
  } catch(e){ console.warn("installStartWrapper failed", e); }
}

// --- Polling / scanning helpers ---

// isBadEndingInstance: heuristics to confirm an instance is badending
function isBadEndingInstance(inst) {
  try {
    if (!inst) return false;
    try {
      var desc = {};
      if (typeof inst.getEventDescription === "function") {
        try { inst.getEventDescription(desc); if (desc && (desc.path || desc.name) && String(desc.path || desc.name).indexOf("badending") !== -1) return true; } catch(e){}
      }
      if (typeof inst.getDescription === "function") {
        try { inst.getDescription(desc); if (desc && (desc.path || desc.name) && String(desc.path || desc.name).indexOf("badending") !== -1) return true; } catch(e){}
      }
      if (typeof inst.getEvent === "function") {
        try { inst.getEvent(desc); if (desc && (desc.path || desc.name) && String(desc.path || desc.name).indexOf("badending") !== -1) return true; } catch(e){}
      }
    } catch(e){}
    try {
      var st = {}; if (typeof inst.getPlaybackState === "function") { inst.getPlaybackState(st); console.log("isBadEndingInstance: playbackState", st && st.val); }
    } catch(e){}
    try {
      var pos = {}; if (typeof inst.getTimelinePosition === "function") { inst.getTimelinePosition(pos); console.log("isBadEndingInstance: timelinePosition", pos && pos.val); }
    } catch(e){}
    try {
      if (inst && inst.$$ && inst.$$.path && String(inst.$$.path).indexOf("badending") !== -1) return true;
      if (inst && inst.path && String(inst.path).indexOf("badending") !== -1) return true;
      if (inst && inst.eventPath && String(inst.eventPath).indexOf("badending") !== -1) return true;
    } catch(e){}
    return false;
  } catch(e) { console.warn("isBadEndingInstance error", e); return false; }
}

// pollAndAttachBadEnding: earlier version (kept for compatibility)
function pollAndAttachBadEnding(timeoutMs = 2000, intervalMs = 100) {
  try {
    var start = Date.now();
    var t = setInterval(function() {
      try {
        if (window._lastBadEndingInstance) {
          console.log("pollAndAttachBadEnding: found _lastBadEndingInstance", window._lastBadEndingInstance);
          attachBadEndingHandlerVerbose(window._lastBadEndingInstance);
          clearInterval(t); return;
        }
        if (Array.isArray(window.monsterEvents)) {
          for (var i = 0; i < window.monsterEvents.length; i++) {
            var e = window.monsterEvents[i];
            if (e && e.instance) {
              try { attachBadEndingHandlerVerbose(e.instance); console.log("pollAndAttachBadEnding: attached to monsterEvents[" + i + "]"); clearInterval(t); return; } catch(e){}
            }
          }
        }
        if (window._lastCreatureInstance) {
          try { attachBadEndingHandlerVerbose(window._lastCreatureInstance); console.log("pollAndAttachBadEnding: attached to _lastCreatureInstance"); clearInterval(t); return; } catch(e){}
        }
        if (Date.now() - start > timeoutMs) {
          console.warn("pollAndAttachBadEnding: timeout, no badending instance found");
          clearInterval(t);
        }
      } catch(e){ console.warn("pollAndAttachBadEnding loop error", e); clearInterval(t); }
    }, intervalMs);
  } catch(e){ console.warn("pollAndAttachBadEnding error", e); }
}

// superScanAndAttachBadEnding: exhaustive scan of globals and lists
function superScanAndAttachBadEnding(timeoutMs = 4000, intervalMs = 120) {
  try {
    var start = Date.now();
    var t = setInterval(function() {
      try {
        var candidates = [
          window._lastBadEndingInstance,
          window.__lastCreatedInstance,
          window._lastCreatureInstance,
          window._lastCabinInstance,
          window._lastCabinDialogueInstance,
          window._lastSafezoneInstance,
          window.activeSpawn && window.activeSpawn.instance
        ];
        if (Array.isArray(window.monsterEvents)) {
          for (var i = 0; i < window.monsterEvents.length; i++) candidates.push(window.monsterEvents[i].instance);
        }

        var seen = new Set();
        var uniq = [];
        for (var k = 0; k < candidates.length; k++) {
          var c = candidates[k];
          if (!c) continue;
          try {
            var id = (c && c.$$ && c.$$.id) || (c && c.__id) || String(c);
            if (seen.has(id)) continue;
            seen.add(id);
          } catch(e){}
          uniq.push(c);
        }

        for (var j = 0; j < uniq.length; j++) {
          var inst = uniq[j];
          try {
            var confirmed = false;
            try {
              var desc = {};
              if (typeof inst.getEventDescription === "function") {
                try { inst.getEventDescription(desc); if (desc && (desc.path || desc.name) && String(desc.path || desc.name).indexOf("badending") !== -1) confirmed = true; } catch(e){}
              }
              if (!confirmed && typeof inst.getDescription === "function") {
                try { inst.getDescription(desc); if (desc && (desc.path || desc.name) && String(desc.path || desc.name).indexOf("badending") !== -1) confirmed = true; } catch(e){}
              }
              if (!confirmed && typeof inst.getEvent === "function") {
                try { inst.getEvent(desc); if (desc && (desc.path || desc.name) && String(desc.path || desc.name).indexOf("badending") !== -1) confirmed = true; } catch(e){}
              }
            } catch(e){}

            if (!confirmed) {
              try { var st = {}; if (typeof inst.getPlaybackState === "function") { inst.getPlaybackState(st); } } catch(e){}
              try { var pos = {}; if (typeof inst.getTimelinePosition === "function") { inst.getTimelinePosition(pos); } } catch(e){}
              try {
                if (inst && inst.$$ && (String(inst.$$.path || "")).indexOf("badending") !== -1) confirmed = true;
                if (!confirmed && inst && inst.path && String(inst.path).indexOf("badending") !== -1) confirmed = true;
                if (!confirmed && inst && inst.eventPath && String(inst.eventPath).indexOf("badending") !== -1) confirmed = true;
              } catch(e){}
            }

            if (confirmed) {
              console.log("superScanAndAttachBadEnding: confirmed badending instance", inst);
              try { window._lastBadEndingInstance = inst; } catch(e){}
              try { attachBadEndingHandlerVerbose(inst); } catch(e){ console.warn("attachBadEndingHandlerVerbose failed", e); }
              clearInterval(t);
              return;
            }
          } catch(e){ console.warn("superScan candidate check failed", e); }
        }

        try {
          if (gSystem && typeof gSystem.getEventList === "function") {
            try {
              var list = {};
              gSystem.getEventList(list);
              console.log("superScanAndAttachBadEnding: gSystem.getEventList ->", list);
            } catch(e){}
          }
        } catch(e){}

        if (Date.now() - start > timeoutMs) {
          console.warn("superScanAndAttachBadEnding: timeout, no badending instance found");
          clearInterval(t);
        }
      } catch(e){ console.warn("superScan loop error", e); clearInterval(t); }
    }, intervalMs);
  } catch(e){ console.warn("superScanAndAttachBadEnding error", e); }
}

// watchEndingParameter: emergency fallback that triggers UI when parameter becomes 1
function watchEndingParameter(pollMs = 120, timeoutMs = 8000) {
  try {
    var start = Date.now();
    var t = setInterval(function() {
      try {
        var res = { ok: false };
        try {
          res = (typeof safeGetParameter === "function") ? safeGetParameter("ending") : (gSystem && typeof gSystem.getParameterByName === "function" ? (function(){ var o={}; try{ gSystem.getParameterByName("ending", o, 0); return (typeof o.val!=="undefined")?{ok:true,val:o.val}:{ok:false}; }catch(e){return {ok:false};}})() : { ok:false });
        } catch(e){ res = { ok:false }; }
        if (res && res.ok) {
          try { console.log("watchEndingParameter: read ending ->", res.val); } catch(e){}
          if (Number(res.val) === 1) {
            try { console.log("watchEndingParameter: ending==1 -> invoking handleEndingIsOne"); } catch(e){}
            try { handleEndingIsOne(); } catch(e){ console.warn("handleEndingIsOne threw from watcher", e); }
            clearInterval(t);
            return;
          }
        }
        if (Date.now() - start > timeoutMs) {
          console.warn("watchEndingParameter: timeout, ending not observed as 1");
          clearInterval(t);
        }
      } catch(e){ console.warn("watchEndingParameter loop error", e); clearInterval(t); }
    }, pollMs);
  } catch(e){ console.warn("watchEndingParameter error", e); }
}

// --- Bank loader ---
function loadBank(name) {
  try {
    var bankhandle = {};
    CHECK(gSystem.loadBankFile("/" + name, FMOD.STUDIO_LOAD_BANK_NORMAL, bankhandle), "loadBank " + name);
    console.log("Loaded bank:", name);
  } catch (e) {
    console.warn("loadBank failed for", name, e);
  }
}

// --- Creature stop handler: reads ending param and falls back to scanner/watcher ---
function attachCreatureStopHandler(inst) {
  try {
    if (!inst || typeof inst.setCallback !== "function") return;
    if (inst.__creatureStopHandlerRegistered) return;
    inst.__creatureStopHandlerRegistered = true;

    inst.setCallback(function(eventType) {
      try {
        if (eventType !== FMOD.STUDIO_EVENT_CALLBACK_STOPPED) return;

        console.log("DEBUG creature STOP: instance:", inst || window._lastCreatureInstance);

        function readEndingOnce() {
          var val = 0;
          try {
            try {
              if (typeof safeGetParameter === "function") {
                var r = safeGetParameter("ending");
                if (r && r.ok) { val = Number(r.val) || 0; console.log("DBG safeGetParameter ->", r); }
              }
            } catch(e){ console.warn("DBG safeGetParameter err", e); }

            if (!val && typeof gSystem !== "undefined" && gSystem && typeof gSystem.getParameterByName === "function") {
              try {
                var out = {};
                var rr = gSystem.getParameterByName("ending", out, 0);
                console.log("DBG gSystem.getParameterByName ->", rr, out);
                if (rr === FMOD.OK && out && typeof out.val !== "undefined") val = Number(out.val) || 0;
              } catch(e){ console.warn("DBG getParameterByName err", e); }
            }

            if (!val && typeof window.endingID !== "undefined" && typeof gSystem !== "undefined" && gSystem && typeof gSystem.getParameterByID === "function") {
              try {
                var out2 = {};
                gSystem.getParameterByID(window.endingID, out2, 0);
                console.log("DBG gSystem.getParameterByID ->", out2);
                if (out2 && typeof out2.val !== "undefined") val = Number(out2.val) || 0;
              } catch(e){ console.warn("DBG getParameterByID err", e); }
            }

            try {
              var instRef = inst || window._lastCreatureInstance;
              if (!val && instRef && typeof instRef.getParameterByName === "function") {
                var out3 = {};
                try {
                  var rinst = instRef.getParameterByName("ending", out3, 0);
                  console.log("DBG inst.getParameterByName ->", rinst, out3);
                  if (out3 && typeof out3.val !== "undefined") val = Number(out3.val) || 0;
                } catch(e){ console.warn("DBG inst.getParameterByName err", e); }
              }
            } catch(e){ console.warn("DBG instance read err", e); }
          } catch(e){ console.warn("DBG overall read err", e); }
          return val;
        }

        try {
          var v0 = readEndingOnce();
          console.log("DEBUG final computed endingVal (immediate) =", v0);
          if (v0 === 1) { handleEndingIsOne(); return; }

          setTimeout(function(){
            try {
              var v1 = readEndingOnce();
              console.log("DEBUG final computed endingVal (100ms) =", v1);
              if (v1 === 1) { handleEndingIsOne(); return; }
            } catch(e){ console.warn("DBG 100ms read error", e); }
          }, 100);

          setTimeout(function(){
            try {
              var v2 = readEndingOnce();
              console.log("DEBUG final computed endingVal (300ms) =", v2);
              if (v2 === 1) { handleEndingIsOne(); return; }
              // fallback: try exhaustive scanner + watcher
              setTimeout(function(){ try { superScanAndAttachBadEnding(4000,120); } catch(e){} }, 50);
              setTimeout(function(){ try { watchEndingParameter(120,8000); } catch(e){} }, 60);
            } catch(e){ console.warn("DBG 300ms read error", e); }
          }, 300);
        } catch(e){ console.warn("DBG immediate read error", e); }
      } catch(e){ console.warn("creature stop handler error", e); }
    }, FMOD.STUDIO_EVENT_CALLBACK_STOPPED);
  } catch(e) { console.warn("attachCreatureStopHandler outer error", e); }
}

// --- initApplication, utilities, event starters, sliders, etc. ---
function initApplication() {
  loadBank("Master.bank");
  loadBank("Master.strings.bank");
  loadBank("Ambience.bank");
  loadBank("Character.bank");

  try {
    var desc = {};
    if (gSystem.getParameterDescriptionByName) {
      if (gSystem.getParameterDescriptionByName("inout", desc) === FMOD.OK) inoutID = desc.id;
      if (gSystem.getParameterDescriptionByName("hit", desc) === FMOD.OK) hitID = desc.id;
      if (gSystem.getParameterDescriptionByName("safezone", desc) === FMOD.OK) safezoneID = desc.id;
      if (gSystem.getParameterDescriptionByName("ending", desc) === FMOD.OK) endingID = desc.id;
      if (gSystem.getParameterDescriptionByName("distance", desc) === FMOD.OK) distanceParamID = desc.id;
      if (gSystem.getParameterDescriptionByName("animals", desc) === FMOD.OK) animalsID = desc.id;
      if (gSystem.getParameterDescriptionByName("rain", desc) === FMOD.OK) rainID = desc.id;
    }
  } catch (e) { console.warn("Parameter resolution failed", e); }

  try {
    var ambienceDesc = {};
    CHECK(gSystem.getEvent("event:/ambience", ambienceDesc), "getEvent(event:/ambience)");
    var ambienceInstObj = {};
    CHECK(ambienceDesc.val.createInstance(ambienceInstObj), "createInstance(ambience)");
    ambienceInstance = ambienceInstObj.val;
    console.log("Ambience instance created (will start after audio unlock)");
  } catch (e) { console.warn("Ambience init failed", e); }

  try {
    var stepDesc = {};
    CHECK(gSystem.getEvent("event:/step", stepDesc), "getEvent(event:/step)");
    var stepInstObj = {};
    CHECK(stepDesc.val.createInstance(stepInstObj), "createInstance(step)");
    stepInstance = stepInstObj.val;
    console.log("Step instance created (will start on demand)");
  } catch (e) { console.warn("step event init failed", e); }

  ensureInitialListener();
  setupSliders();

  // Try to attach early scanner + watcher in case badending is created immediately
  try { superScanAndAttachBadEnding(3000, 120); } catch(e){}
  try { watchEndingParameter(120, 8000); } catch(e){}
}

// --- utilities ---
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function setVector(vector, x, y, z) { vector.x = x; vector.y = y; vector.z = z; }

function screenToWorld(clientX, clientY) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const px = clientX / vw, py = clientY / vh;
  const SCALE = 3;
  return { x: (px - 0.5) * vw / 100 * SCALE, y: 0, z: (py - 0.5) * vh / 100 * SCALE * -1 };
}

function worldToScreen(worldX, worldZ) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const SCALE = 3;
  const px = (worldX / (vw/100*SCALE)) + 0.5;
  const py = (-worldZ / (vh/100*SCALE)) + 0.5;
  return { clientX: Math.max(0, Math.min(vw, px * vw)), clientY: Math.max(0, Math.min(vh, py * vh)) };
}

function ensureInitialListener() {
  if (window.listenerPos) return;
  const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  const world = screenToWorld(cx, cy);
  window.listenerPos = world;
  try {
    var attributes = FMOD._3D_ATTRIBUTES();
    setVector(attributes.position, world.x, 0, world.z);
    setVector(attributes.velocity, 0, 0, 0);
    setVector(attributes.forward, 0, 0, 1);
    setVector(attributes.up, 0, 1, 0);
    gSystem.setListenerAttributes(0, attributes, null);
    console.log("Listener set at", world);
  } catch (e) { console.warn("setListenerAttributes failed", e); }
}

// sliders
function setupSliders() {
  try {
    const animalsSlider = document.getElementById("animalsSlider");
    const rainSlider = document.getElementById("rainSlider");

    if (animalsSlider) {
      animalsSlider.addEventListener("input", e => {
        const v = parseFloat(e.target.value);
        try {
          if (typeof gSystem.setParameterByName === "function") {
            gSystem.setParameterByName("animals", v, false);
          } else if (typeof animalsID !== "undefined" && animalsID !== null && typeof gSystem.setParameterByID === "function") {
            gSystem.setParameterByID(animalsID, v, false);
          }
          try { gSystem.update(); } catch(e){}
          console.log("animals param set ->", v);
        } catch (err) { console.warn("animals slider set failed", err); }
      });
    }

    if (rainSlider) {
      rainSlider.addEventListener("input", e => {
        const v = parseFloat(e.target.value);
        try {
          if (typeof gSystem.setParameterByName === "function") {
            gSystem.setParameterByName("rain", v, false);
          } else if (typeof rainID !== "undefined" && rainID !== null && typeof gSystem.setParameterByID === "function") {
            gSystem.setParameterByID(rainID, v, false);
          }
          try { gSystem.update(); } catch(e){}
          console.log("rain param set ->", v);
        } catch (err) { console.warn("rain slider set failed", err); }
      });
    }
  } catch (e) {
    console.warn("setupSliders error", e);
  }
}

// --- event starters and play helpers ---
window.safeCreateAndStart = function(eventPath) {
  try {
    if (!gSystem) { console.warn("safeCreateAndStart: gSystem not ready"); return null; }
    var desc = {};
    var r = gSystem.getEvent(eventPath, desc);
    console.log("safeCreateAndStart getEvent", eventPath, "->", r);
    if (r !== FMOD.OK || !desc || !desc.val) return null;
    var instObj = {};
    var cr = desc.val.createInstance(instObj);
    console.log("safeCreateAndStart createInstance", eventPath, "->", cr);
    if (cr !== FMOD.OK || !instObj.val) return null;
    var inst = instObj.val;
    try {
      inst.start();
      console.log("safeCreateAndStart started", eventPath);
      try { gSystem.update(); } catch(e){}
    } catch (e) {
      console.warn("safeCreateAndStart start threw for", eventPath, e);
    }
    return inst;
  } catch (err) {
    console.warn("safeCreateAndStart unexpected", err);
    return null;
  }
};

window.startCreatureEvent = function() {
  try {
    var inst = null;
    if (typeof window.safeCreateAndStart === "function") {
      inst = window.safeCreateAndStart("event:/creature");
	// Dopo la creazione/avvio dell'istanza creature
try {
  var inst = (typeof window.safeCreateAndStart === "function") ? window.safeCreateAndStart("event:/creature") : null;
  console.log("safeCreateAndStart creature ->", inst ? "instance" : "null", inst);
  if (inst) {
    window._lastCreatureInstance = inst;
    // assicurati che startCreatureSequence venga chiamata e che usi questa istanza
    if (typeof window.startCreatureSequence === "function") {
      console.log("Calling startCreatureSequence() after creating creature instance");
      window.startCreatureSequence();
    }
  }
} catch(e){ console.warn("auto-start creature wrapper failed", e); }

    } else if (gSystem && typeof gSystem.getEvent === "function") {
      var desc = {};
      var r = gSystem.getEvent("event:/creature", desc);
      if (r === FMOD.OK && desc && desc.val && typeof desc.val.createInstance === "function") {
        var obj = {};
        var cr = desc.val.createInstance(obj);
        if (cr === FMOD.OK && obj.val) {
          inst = obj.val;
          try { if (typeof inst.start === "function") inst.start(); } catch(e){ console.warn("startCreatureEvent: start threw", e); }
        }
      }
    }
    if (inst) {
      window._lastCreatureInstance = inst;
      try { attachCreatureStopHandler(inst); } catch(e){ console.warn("attachCreatureStopHandler failed", e); }
    } else {
      console.warn("startCreatureEvent: could not create creature instance");
    }
    return inst;
  } catch(e) {
    console.warn("startCreatureEvent error", e);
    return null;
  }
};

// playCabinEvent
window.playCabinEvent = function() {
  try {
    if (typeof window._externalPlayCabinEvent === "function") {
      try { window._externalPlayCabinEvent(); console.log("playCabinEvent: called external implementation"); return; } catch(e){ console.warn("externalPlayCabinEvent threw", e); }
    }

    function stopAndReleaseCabin(inst, name) {
      try {
        if (!inst) return;
        if (typeof inst.stop === "function") {
          try { inst.stop(FMOD.STOP_ALLOWFADEOUT); console.log("stop called on", name); }
          catch (e) { try { inst.stop(); console.log("stop fallback called on", name); } catch(e2) { console.warn("stop fallback failed on", name, e2); } }
        }
        try { if (typeof inst.release === "function") { inst.release(); console.log("release called on", name); } } catch(e){}
      } catch (e) {
        console.warn("stopAndReleaseCabin error for", name, e);
      }
    }

    try {
      stopAndReleaseCabin(window._lastCabinInstance, "_lastCabinInstance");
      window._lastCabinInstance = null;
    } catch(e){ console.warn("Error stopping previous _lastCabinInstance", e); }

    try { if (gSystem && typeof gSystem.update === "function") gSystem.update(); } catch(e){}

    var inst = null;
    try {
      if (typeof window.safeCreateAndStart === "function") {
        inst = window.safeCreateAndStart("event:/cabin");
      } else if (gSystem && typeof gSystem.getEvent === "function") {
        var desc = {};
        var r = gSystem.getEvent("event:/cabin", desc);
        if (r === FMOD.OK && desc && desc.val && typeof desc.val.createInstance === "function") {
          var instObj = {};
          var cr = desc.val.createInstance(instObj);
          if (cr === FMOD.OK && instObj.val) {
            inst = instObj.val;
            try { inst.start(); } catch(e){ console.warn("cabin start threw", e); }
          }
        }
      }
    } catch (e) {
      console.warn("playCabinEvent creation/start failed", e);
    }

    if (!inst) {
      console.warn("playCabinEvent: failed to start event:/cabin (no instance returned)");
      return;
    }

    window._lastCabinInstance = inst;

    try {
      if (typeof inst.setCallback === "function") {
        inst.setCallback((eventType) => {
          try {
            if (eventType === FMOD.STUDIO_EVENT_CALLBACK_STOPPED) {
              if (window._lastCabinInstance === inst) window._lastCabinInstance = null;
              console.log("cabin instance stopped and _lastCabinInstance cleared");
            }
          } catch (cbErr) { console.warn("cabin callback error", cbErr); }
        }, FMOD.STUDIO_EVENT_CALLBACK_STOPPED);
      }
    } catch (e) { console.warn("Failed to set callback on cabin instance", e); }

    try { if (gSystem && typeof gSystem.update === "function") gSystem.update(); } catch(e){}

  } catch (e) {
    console.warn("playCabinEvent error", e);
  }
};

// rampInoutToZero (robust)
function rampInoutToZero(durationMs) {
  if (!gSystem) return;
  try {
    var cur = 1.0;
    var got = false;
    try {
      var out = {};
      if (typeof gSystem.getParameterByName === "function") {
        try {
          const res = gSystem.getParameterByName("inout", out, 0);
          if (res === FMOD.OK && out && typeof out.val !== "undefined") { cur = out.val; got = true; }
        } catch (e) {
          try {
            const res2 = gSystem.getParameterByName("inout", out);
            if (res2 === FMOD.OK && out && typeof out.val !== "undefined") { cur = out.val; got = true; }
          } catch (e2) {
            console.warn("rampInoutToZero: getParameterByName fallback failed", e2);
          }
        }
      } else if (typeof inoutID !== "undefined" && gSystem.getParameterByID) {
        var out2 = {};
        try { gSystem.getParameterByID(inoutID, out2); } catch(e){}
        if (out2 && typeof out2.val !== "undefined") { cur = out2.val; got = true; }
      }
    } catch (e) { console.warn("rampInout read failed", e); }

    const steps = Math.max(6, Math.floor(durationMs / 60));
    const stepMs = durationMs / steps;
    let step = 0;
    const startVal = got ? cur : 1.0;
    const timer = setInterval(() => {
      step++;
      const t = step / steps;
      const next = startVal * (1 - t);
      try {
        if (typeof gSystem.setParameterByName === "function") {
          try {
            gSystem.setParameterByName("inout", next, false);
          } catch (e) {
            try { gSystem.setParameterByName("inout", next); } catch(e2) {}
          }
        } else if (typeof inoutID !== "undefined" && gSystem.setParameterByID) {
          try { gSystem.setParameterByID(inoutID, next, false); } catch(e){}
        }
        try { if (gSystem && typeof gSystem.update === "function") gSystem.update(); } catch(e){}
      } catch (e) {}
      if (step >= steps) {
        clearInterval(timer);
        try {
          if (typeof gSystem.setParameterByName === "function") {
            try { gSystem.setParameterByName("inout", 0, false); } catch(e) { try { gSystem.setParameterByName("inout", 0); } catch(e2){} }
          } else if (typeof inoutID !== "undefined" && gSystem.setParameterByID) {
            try { gSystem.setParameterByID(inoutID, 0, false); } catch(e){}
          }
          try { if (gSystem && typeof gSystem.update === "function") gSystem.update(); } catch(e){}
        } catch(e){}
      }
    }, stepMs);
  } catch (e) { console.warn("rampInoutToZero unexpected", e); }
}

window.playCabinDialogueEvent = function() {
  try {
    // --- PICK DIALOGUE EVENT ---
    const candidates = ["event:/cabindialogue", "event:/cabindialogue2", "event:/cabin"];
    let pathUsed = null;

    for (let c of candidates) {
      try {
        let desc = {};
        let r = gSystem.getEvent(c, desc);
        if (r === FMOD.OK && desc.val && typeof desc.val.createInstance === "function") {
          pathUsed = c;
          break;
        }
      } catch(e){}
    }

    if (!pathUsed) {
      console.warn("playCabinDialogueEvent: no dialogue event found");
      return;
    }

    // --- STOP PREVIOUS CABIN ONLY IF cabindialogue2 ---
    if (pathUsed === "event:/cabindialogue2") {
      try {
        if (window._lastCabinInstance) {
          window._lastCabinInstance.stop(FMOD.STOP_ALLOWFADEOUT);
          window._lastCabinInstance.release();
        }
      } catch(e){}
      window._lastCabinInstance = null;
    }

    // --- START DIALOGUE ---
    let inst = null;
    try {
      let desc = {};
      let r = gSystem.getEvent(pathUsed, desc);
      if (r === FMOD.OK && desc.val) {
        let instObj = {};
        let cr = desc.val.createInstance(instObj);
        if (cr === FMOD.OK && instObj.val) {
          inst = instObj.val;
          inst.start();
          gSystem.update();
        }
      }
    } catch(e){}

    if (!inst) return;

    window._lastCabinDialogueInstance = inst;

    // --- CALLBACK ---
    inst.setCallback((eventType) => {
      if (eventType !== FMOD.STUDIO_EVENT_CALLBACK_STOPPED) return;

      // spawn creature + drag button
      try { window.spawnSingleMonsterRandom(60); } catch(e){}
      try { window.showDragMonsterButton(); } catch(e){}

      // only for cabindialogue2
      if (pathUsed === "event:/cabindialogue2") {

        // running flag
        try { safeSetParameter("running", 1); } catch(e){}

        // inout = 1
        try { safeSetParameter("inout", 1); } catch(e){}

        // --- SAFEZONE: create once ---
        try {
          if (!window._lastSafezoneInstance) {

            let sd = {};
            let rr = gSystem.getEvent("event:/safezone", sd);

            if (rr === FMOD.OK && sd.val) {
              let instObj = {};
              let cr = sd.val.createInstance(instObj);

              if (cr === FMOD.OK && instObj.val) {
                window._lastSafezoneInstance = instObj.val;

                // safezonepar starts at 0
                instObj.val.setParameterByName("safezonepar", 0, false);

                instObj.val.start();
                gSystem.update();

                console.log("SAFEZONE STARTED");
              }
            }
          }
        } catch(e){}

        // ramp inout down
        try { rampInoutToZero(3000); } catch(e){}

        // UI + creature
        setTimeout(() => { try { window.createActionButtons(); } catch(e){} }, 300);
        setTimeout(() => { try { window.startCreatureSequence(); } catch(e){} }, 900);
      }

    }, FMOD.STUDIO_EVENT_CALLBACK_STOPPED);

  } catch(e){
    console.warn("playCabinDialogueEvent error", e);
  }
};


// playKnockEvent
window.playKnockEvent = function() {
  try {
    if (!gSystem) { console.warn("playKnockEvent: gSystem not ready"); return null; }
    var knockDesc = {};
    var res = gSystem.getEvent("event:/knock", knockDesc);
    console.log("playKnockEvent getEvent ->", res);
    if (res !== FMOD.OK) { console.warn("getEvent(knock) failed", res); return null; }
    var instObj = {};
    var cr = knockDesc.val.createInstance(instObj);
    console.log("playKnockEvent createInstance ->", cr);
    if (cr !== FMOD.OK) { console.warn("createInstance(knock) failed", cr); return null; }
    var inst = instObj.val;
    window.knockInstanceRef = function() { return inst; };
    try {
      inst.start();
      console.log("knock started");
      try { gSystem.update(); } catch(e){}
    } catch (e) { console.warn("knock start threw", e); }
    return inst;
  } catch (e) {
    console.warn("playKnockEvent error", e);
    return null;
  }
};

window.setParam = function(name, value) {
  try {
    if (!gSystem) return false;
    if (typeof gSystem.setParameterByName === "function") {
      gSystem.setParameterByName(name, value, false);
      try { gSystem.update(); } catch(e){}
      return true;
    } else if (typeof gSystem.setParameterByID === "function" && typeof window[name + "ID"] !== "undefined") {
      try { gSystem.setParameterByID(window[name + "ID"], value, false); try { gSystem.update(); } catch(e){}; return true; } catch(e){ return false; }
    }
  } catch (e) { console.warn("setParam error", name, e); }
  return false;
};

// spawnSingleMonsterRandom
window.spawnSingleMonsterRandom = function(marginPx = 60) {
  try {
    if (window.activeSpawn) {
      try { if (window.activeSpawn.instance && typeof window.activeSpawn.instance.stop === "function") window.activeSpawn.instance.stop(FMOD.STOP_ALLOWFADEOUT); } catch(e){}
      window.activeSpawn = null;
    }

    const vw = Math.max(100, window.innerWidth);
    const vh = Math.max(100, window.innerHeight);
    const sx = marginPx + Math.random() * (vw - marginPx * 2);
    const sy = marginPx + Math.random() * (vh - marginPx * 2);

    const worldPos = screenToWorld(sx, sy);

    var desc = {};
    var res = gSystem.getEvent("event:/monstercry", desc);
    if (res !== FMOD.OK || !desc || !desc.val) {
      console.warn("spawnSingleMonsterRandom: monstercry event not found", res);
      return null;
    }
    var instObj = {};
    var cr = desc.val.createInstance(instObj);
    if (cr !== FMOD.OK || !instObj.val) {
      console.warn("spawnSingleMonsterRandom: createInstance failed", cr);
      return null;
    }
    var inst = instObj.val;

    try {
      if (typeof inst.set3DAttributes === "function") {
        var attributes = {
          position: { x: worldPos.x, y: worldPos.y || 0, z: worldPos.z },
          velocity: { x: 0, y: 0, z: 0 },
          forward: { x: 0, y: 0, z: 1 },
          up: { x: 0, y: 1, z: 0 }
        };
        inst.set3DAttributes(attributes);
      }
    } catch (e) { console.warn("spawnSingleMonsterRandom set3DAttributes error", e); }

    try { inst.start(); try { gSystem.update(); } catch(e){} } catch(e){ console.warn("spawnSingleMonsterRandom start threw", e); }

    window.activeSpawn = {
      instance: inst,
      position: worldPos,
      screenPos: { clientX: sx, clientY: sy }
    };

    console.log("spawnSingleMonsterRandom created at screen", sx, sy, "world", worldPos);
    return window.activeSpawn;
  } catch (err) {
    console.warn("spawnSingleMonsterRandom unexpected", err);
    return null;
  }
};

// initMonsterEventsRandom (restored)
function initMonsterEventsRandom(count = 4, minDistanceFromListener = 100, minInterEventDistance = 60, marginPx = 60) {
  try {
    (window.monsterEvents || []).forEach(ev => {
      try { if (ev.markerEl && ev.markerEl.parentNode) ev.markerEl.parentNode.removeChild(ev.markerEl); } catch(e){}
      try { if (ev.instance && typeof ev.instance.stop === "function") ev.instance.stop(FMOD.STOP_ALLOWFADEOUT); } catch(e){}
    });
  } catch(e){ console.warn("cleanup monsterEvents failed", e); }
  window.monsterEvents = [];

  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = (a.y || 0) - (b.y || 0);
    const dz = a.z - b.z;
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
  }

  const listenerWorld = window.listenerPos || { x: 0, y: 0, z: 0 };

  function randomScreenPos() {
    const vw = Math.max(100, window.innerWidth);
    const vh = Math.max(100, window.innerHeight);
    const x = marginPx + Math.random() * (vw - marginPx * 2);
    const y = marginPx + Math.random() * (vh - marginPx * 2);
    return { clientX: x, clientY: y };
  }

  function randomWorldPosFromScreen() {
    const s = randomScreenPos();
    return screenToWorld(s.clientX, s.clientY);
  }

  for (let i = 0; i < count; i++) {
    let posWorld;
    let attempts = 0;
    do {
      posWorld = randomWorldPosFromScreen();
      attempts++;
      if (attempts > 500) {
        const fallbackX = window.innerWidth * (0.5 + 0.12 * Math.cos(i));
        const fallbackY = window.innerHeight * (0.5 + 0.12 * Math.sin(i));
        posWorld = screenToWorld(fallbackX, fallbackY);
        break;
      }
      if (dist(posWorld, listenerWorld) < minDistanceFromListener) continue;
      let ok = true;
      for (let j = 0; j < window.monsterEvents.length; j++) {
        if (dist(posWorld, window.monsterEvents[j].position) < minInterEventDistance) {
          ok = false;
          break;
        }
      }
      if (ok) break;
    } while (true);

    try {
      var desc = {};
      var res = gSystem.getEvent("event:/monstercry", desc);
      if (res !== FMOD.OK) {
        console.warn("monstercry event not found for index", i, "res:", res);
        continue;
      }

      var instObj = {};
      res = desc.val.createInstance(instObj);
      if (res !== FMOD.OK) {
        console.warn("createInstance(monstercry) failed for index", i, "res:", res);
        continue;
      }

      var inst = instObj.val;

      try {
        if (typeof inst.set3DAttributes === "function") {
          var attributes = {
            position: { x: posWorld.x, y: posWorld.y, z: posWorld.z },
            velocity: { x: 0, y: 0, z: 0 },
            forward: { x: 0, y: 0, z: 1 },
            up: { x: 0, y: 1, z: 0 }
          };
          inst.set3DAttributes(attributes);
        }
      } catch (e) {
        console.warn("Errore set3DAttributes monstercry:", e);
      }

      try { inst.start(); try { gSystem.update(); } catch(e){} } catch (e) { console.warn("Errore start monstercry:", e); }

      const marker = document.createElement("div");
      marker.className = "monster-marker";
      marker.style.position = "absolute";
      marker.style.width = "18px";
      marker.style.height = "18px";
      marker.style.borderRadius = "50%";
      marker.style.background = "rgba(200,40,40,0.95)";
      marker.style.boxShadow = "0 0 8px rgba(200,40,40,0.6)";
      marker.style.pointerEvents = "none";
      marker.style.zIndex = 9998;
      marker.dataset.id = "monstercry_" + i;
      marker.style.opacity = "0";
      marker.style.transition = "opacity 600ms ease, transform 300ms ease";
      document.body.appendChild(marker);

      window.monsterEvents.push({
        id: "monstercry_" + i,
        instance: inst,
        position: posWorld,
        _isEncountered: false,
        markerEl: marker
      });

      console.log("monstercry created", i, "posWorld", posWorld, "attempts", attempts);

    } catch (err) {
      console.warn("initMonsterEventsRandom error:", err);
    }
  }

  window.monsterEvents = window.monsterEvents;
  setTimeout(() => {
    (window.monsterEvents || []).forEach(ev => {
      try {
        const screen = worldToScreen(ev.position.x, ev.position.z);
        ev.markerEl.style.left = (screen.clientX - 9) + "px";
        ev.markerEl.style.top = (screen.clientY - 9) + "px";
        ev.markerEl.style.opacity = "1";
      } catch(e){}
    });
  }, 900);
}

// ---------- START SEQUENZA CREATURE ----------
function startCreatureSequence() {
  try {

    // 🔥 Cancella TUTTI i timer residui
    try { clearCreatureFlowTimers(); } catch(e){}

    // Reset stato
    window._creatureFlow.running = true;
    window._creatureFlow._hitHandled = false;
    window._creatureFlow._ignoreStopCallback = false;
    window._creatureFlow.playerKilled = false;
    window._creatureFlow.swingWindowOpen = false;
    window._creatureFlow.instance = null;

    // --- CREA ISTANZA CREATURE ---
    var inst = null;
    try {
      var desc = {};
      var r = gSystem.getEvent("event:/creature", desc);
      if (r === FMOD.OK && desc.val && typeof desc.val.createInstance === "function") {
        var instObj = {};
        var cr = desc.val.createInstance(instObj);
        if (cr === FMOD.OK && instObj.val) {
          inst = instObj.val;
          inst.start();
          try { gSystem.update(); } catch(e){}
        }
      }
    } catch(e){ console.warn("startCreatureSequence: create/start creature failed", e); }

    if (!inst) {
      console.warn("startCreatureSequence: creature instance not created");
      window._creatureFlow.running = false;
      return;
    }

    // --- SAFEZONE: se non è già partito, parte ORA ---
    try {
      if (!window._lastSafezoneInstance) {
        let sd = {};
        let rr = gSystem.getEvent("event:/safezone", sd);
        if (rr === FMOD.OK && sd.val) {
          let instObj = {};
          let cr = sd.val.createInstance(instObj);
          if (cr === FMOD.OK && instObj.val) {
            window._lastSafezoneInstance = instObj.val;
            instObj.val.setParameterByName("safezonepar", 0, false);
            instObj.val.start();
            gSystem.update();
            console.log("SAFEZONE STARTED (from creature)");
          }
        }
      }
    } catch(e){ console.warn("safezone start failed", e); }

    // --- SALVA STATO ---
    window._creatureFlow.instance = inst;
    window._creatureFlow.startTs = Date.now();
    console.log("Creature START at", window._creatureFlow.startTs);

    // --- CALLBACK STOP ---
    if (typeof inst.setCallback === "function") {
      inst.setCallback(function(eventType) {
        try {
          if (eventType === FMOD.STUDIO_EVENT_CALLBACK_STOPPED) {
            console.log("Creature STOP callback -> invoked");

            // se l'hit è già stato gestito, ignora STOP
if (window._creatureFlow._hitHandled || window._creatureFlow._ignoreStopCallback) {
    console.log("STOP ignored (hitHandled or ignoreStopCallback)");

    // 🔥 SE NON SIAMO IN SAFE ENDING → RIPARTI
    if (!window._disableActionHeader) {
        console.log("Scheduling creature restart...");
        window._creatureFlow.restartTimer = setTimeout(() => {
            try {
                console.log("Restarting creature sequence...");
                window._creatureFlow._hitHandled = false;
                window._creatureFlow._ignoreStopCallback = false;
                window._creatureFlow.instance = null;
                window._creatureFlow.swingWindowOpen = false;
                clearCreatureFlowTimers();
                startCreatureSequence();
            } catch(e){
                console.warn("Creature restart failed", e);
            }
        }, 5000);
    }

    return;
}


            // altrimenti risolvi normalmente
            clearCreatureFlowTimers();
            resolveCreatureSequence();
          }
        } catch(e){ console.warn("STOP callback error", e); }
      }, FMOD.STUDIO_EVENT_CALLBACK_STOPPED);
    }

    // --- SWING WINDOW ---
    const OPEN_MS = CREATURE_SWING_WINDOW_START_MS;
    const END_MS  = CREATURE_SWING_WINDOW_END_MS;
    const DURATION_MS = END_MS - OPEN_MS;

    window._creatureFlow.swingWindowOpenTimer = setTimeout(() => {
      window._creatureFlow.swingWindowOpen = true;
      console.log("Creature: swing window OPEN");

      window._creatureFlow.swingWindowCloseTimer = setTimeout(() => {
        window._creatureFlow.swingWindowOpen = false;
        console.log("Creature: swing window CLOSED");
      }, DURATION_MS);

    }, OPEN_MS);

    // --- END TIMER ---
    const fallbackMs = Math.max(END_MS + 100, 6000);
    window._creatureFlow.endTimer = setTimeout(() => {
      console.log("Creature: endTimer fired -> resolve");
      resolveCreatureSequence();
    }, fallbackMs);

  } catch(e){
    console.warn("startCreatureSequence error", e);
  }
}


function clearCreatureFlowTimers() {
  try {
    window._creatureFlow = window._creatureFlow || {};
    const f = window._creatureFlow;
    try { if (f.swingWindowOpenTimer) { clearTimeout(f.swingWindowOpenTimer); f.swingWindowOpenTimer = null; } } catch(e){}
    try { if (f.swingWindowCloseTimer) { clearTimeout(f.swingWindowCloseTimer); f.swingWindowCloseTimer = null; } } catch(e){}
    try { if (f.endTimer) { clearTimeout(f.endTimer); f.endTimer = null; } } catch(e){}
    try { if (f.restartTimer) { clearTimeout(f.restartTimer); f.restartTimer = null; } } catch(e){}
    // non resettare qui running/instance/_hitHandled: lo fa la logica chiamante quando serve
  } catch (e) {
    console.warn("clearCreatureFlowTimers error", e);
  }
}


// ---------- GESTIONE SWING (da collegare al pulsante) ----------
function onPlayerSwing() {
  try {
    if (!window._creatureFlow.running) return false;
    if (!window._creatureFlow.swingWindowOpen) {
      console.log("Swing fuori finestra");
      return false;
    }

    // swing in tempo: il giocatore "uccide" la creatura -> play creaturelose
    window._creatureFlow.playerKilled = true;
    console.log("Player swing in window -> play creaturelose and stop creature");

    // stop creature
	window._creatureFlow._ignoreStopCallback = true;
    try { stopAndReleaseInstance(window._creatureFlow.instance); } catch(e){ console.warn("stop creature failed", e); }

    // play creaturelose
    try {
      playEventOnce("event:/creaturelose");
    } catch(e){ console.warn("play creaturelose failed", e); }

    // schedule restart after CREATURE_RESTART_DELAY_MS
    try {
      window._creatureFlow.restartTimer = setTimeout(function() {
        console.log("Restarting creature after creaturelose delay");
        startCreatureSequence();
      }, CREATURE_RESTART_DELAY_MS);
    } catch(e){ console.warn("scheduling restart failed", e); }

    // mark sequence resolved locally
    clearCreatureFlowTimers();
    window._creatureFlow.running = false;
    return true;
  } catch(e) {
    console.warn("onPlayerSwing error", e);
    return false;
  }
}

// Riscrittura difensiva e idempotente di resolveCreatureSequence
function resolveCreatureSequence() {
  try {
    const f = window._creatureFlow;
    if (!f || !f.running) return;

    clearCreatureFlowTimers();
    f.running = false;

    // se l'hit è stato gestito → NON creaturewin
    if (f._hitHandled || f.playerKilled) {
      f._hitHandled = false;
      f.playerKilled = false;

      try { stopAndReleaseInstance(f.instance); } catch(e){}
      f.instance = null;
      return;
    }

    // altrimenti → creaturewin
    try { stopAndReleaseInstance(f.instance); } catch(e){}
    f.instance = null;

    try { playEventOnce("event:/creaturewin"); } catch(e){}
    try { handleEndingIsOne(); } catch(e){}

  } catch(e){
    console.warn("resolveCreatureSequence error", e);
  }
}


// ---------- UTILIZZO ----------
// 1) Al posto di chiamare direttamente startCreatureEvent(), chiama startCreatureSequence()
//    es: startCreatureSequence();

// 2) Collega il pulsante swing a onPlayerSwing()
//    es: document.getElementById('swingBtn').addEventListener('click', onPlayerSwing);

// 3) Se hai una funzione che risolve il combattimento lato UI, puoi chiamare onPlayerSwing() da lì

// start creature event and set unified callback for marker + stop
function startCreatureEvent() {
  if (!window.__audioUnlocked) {
    setTimeout(startCreatureEvent, 200);
    return;
  }

  try {
    var desc = {};
    var res = gSystem.getEvent("event:/creature", desc);
    if (res !== FMOD.OK) {
      console.warn("creature event missing", res);
      return null;
    }

    var instObj = {};
    var createRes = desc.val.createInstance(instObj);
    if (createRes !== FMOD.OK) {
      console.warn("creature create failed", createRes);
      return null;
    }

    var inst = instObj.val;

    // NON registriamo callback qui
    // La sequenza è gestita da startCreatureSequence()

    try {
      inst.start();
      try { gSystem.update(); } catch(e){}
    } catch(e){
      console.warn("creature start threw", e);
    }

    // salviamo solo per debug
    window._lastCreatureInstance = inst;

    return inst;

  } catch(e){
    console.warn("startCreatureEvent unexpected", e);
    return null;
  }
}

function handleCreatureStopped() {
  try {
    // se il giocatore ha appena ucciso la creatura, resetta la flag e continua il flusso normale
    if (window._playerKilledCreature) {
      window._playerKilledCreature = false;
      try { checkSafezoneImmediate(); } catch(e){ console.warn("checkSafezoneImmediate failed", e); }
      return;
    }

    // altrimenti controlla la safezone; se non siamo in safezone, mostra la schermata di morte
    try {
      checkSafezoneImmediate();
      // se checkSafezoneImmediate non ha gestito l'ending, allora è morte del giocatore
      triggerDeathEnding();
    } catch(e) {
      console.warn("handleCreatureStopped: error during safezone check", e);
      triggerDeathEnding();
    }
  } catch (e) {
    console.warn("handleCreatureStopped error", e);
  }
}

function checkSafezoneImmediate() {
  try {
    let val = 0;
    try {
      const res = (typeof safeGetParameter === "function")
        ? safeGetParameter("safezone")
        : { ok:false };
      if (res.ok) val = Number(res.val) || 0;
    } catch(e){ val = 0; }

    if (val >= 1) {
      // blocca la sequenza della creatura
      if (window._creatureFlow) {
        window._creatureFlow.running = false;
        window._creatureFlow.swingWindowOpen = false;
        window._creatureFlow._hitHandled = true;
        window._creatureFlow._ignoreStopCallback = true;
      }
      triggerSafeEnding();
      return;
    }
  } catch (e) {
    console.warn("checkSafezoneImmediate error", e);
  }
}



function triggerSafeEnding() {
  try {
	// 🔥 ferma floating text iniziale
try {
    if (window.floatingInterval) {
        clearInterval(window.floatingInterval);
        window.floatingInterval = null;
    }
} catch(e){}

// 🔥 ferma floating text del combattimento
try {
    if (window._runFloatingInterval) {
        clearInterval(window._runFloatingInterval);
        window._runFloatingInterval = null;
    }
} catch(e){}

// 🔥 rimuovi TUTTI i nodi floating
document.querySelectorAll(".floatingText, .runFloating").forEach(n => {
    try { n.remove(); } catch(e){}
});
    console.log("SAFE ENDING TRIGGERED");

    // 🔥 BLOCCA RICREAZIONE UI COMBATTIMENTO
    window._disableActionHeader = true;

    // 🔥 FERMA LA CREATURA SUBITO
    if (window._creatureFlow && window._creatureFlow.instance) {
      try { window._creatureFlow.instance.stop(); } catch(e){}
      try { window._creatureFlow.instance.release(); } catch(e){}
      window._creatureFlow.instance = null;
    }

    // 🔥 BLOCCA STOP CALLBACK
    if (window._creatureFlow) {
      window._creatureFlow._ignoreStopCallback = true;
      window._creatureFlow.running = false;
      window._creatureFlow._hitHandled = true;
      window._creatureFlow.swingWindowOpen = false;
    }

    // 🔥 BLOCCA RESTART
    if (window._creatureFlow && window._creatureFlow.restartTimer) {
      clearTimeout(window._creatureFlow.restartTimer);
      window._creatureFlow.restartTimer = null;
    }

    // 🔥 CANCELLA TUTTI I TIMER
    try { clearCreatureFlowTimers(); } catch(e){}

    // 🔥 RIMUOVI UI COMBATTIMENTO
    const actionHeader = document.getElementById("actionHeader");
    if (actionHeader) actionHeader.remove();

    const monsterHeader = document.getElementById("monsterHeader");
    if (monsterHeader) monsterHeader.remove();

    const floating = document.getElementById("floatingTextContainer");
    if (floating) floating.remove();

    const action = document.getElementById("actionButtonsContainer");
    if (action) action.remove();

    const drag = document.getElementById("dragMonsterBtn");
    if (drag) drag.remove();

    // 🔥 MOSTRA FINALE SAFE
    fadeOutAllUIAndShowMessage(
      "YOU REACHED A SAFE HEAVEN",
      "#2bbf4a",
      "i mean.. my portfolio!"
    );

  } catch(e){
    console.warn("triggerSafeEnding error", e);
  }
}


function fadeOutAllUIAndShowMessage(titleText, titleColor, subtitleText) {
  try {
    // elementi già gestiti
    const container = document.getElementById("actionButtonsContainer");
    if (container) {
      container.style.transition = "opacity 800ms ease, transform 800ms ease";
      container.style.opacity = "0";
      container.style.transform = "translateY(12px) scale(0.98)";
    }

    const promptEl = document.getElementById("listenPrompt");
    if (promptEl) {
      promptEl.style.transition = "opacity 800ms ease, transform 800ms ease";
      promptEl.style.opacity = "0";
      promptEl.style.transform = "translateY(-8px) scale(0.98)";
    }

    const listenerEl = document.getElementById("listener");
    if (listenerEl) {
      listenerEl.style.transition = "opacity 800ms ease, transform 800ms ease";
      listenerEl.style.opacity = "0";
      listenerEl.style.transform = "translateY(-12px) scale(0.96)";
      listenerEl.style.pointerEvents = "none";
    }

    const tap = document.getElementById("tapText");
    if (tap) tap.style.opacity = "0";

    const intro = document.getElementById("introText");
    if (intro) intro.style.opacity = "0";

    // 🔥 aggiunta: nascondi header del combattimento
    const actionHeader = document.getElementById("actionHeader");
    if (actionHeader) {
      actionHeader.style.transition = "opacity 600ms ease";
      actionHeader.style.opacity = "0";
    }

    // 🔥 aggiunta: nascondi dragMonsterBtn
    const drag = document.getElementById("dragMonsterBtn");
    if (drag) {
      drag.style.transition = "opacity 600ms ease";
      drag.style.opacity = "0";
    }

    // 🔥 aggiunta: nascondi floatingTextContainer
    const floating = document.getElementById("floatingTextContainer");
    if (floating) {
      floating.style.transition = "opacity 600ms ease";
      floating.style.opacity = "0";
    }

  } catch (e) {}

  // 🔥 rimozione effettiva dopo il fade
  setTimeout(() => {
    try { const el = document.getElementById("actionHeader"); if (el) el.remove(); } catch(e){}
    try { const el = document.getElementById("dragMonsterBtn"); if (el) el.remove(); } catch(e){}
    try { const el = document.getElementById("floatingTextContainer"); if (el) el.remove(); } catch(e){}
    try { const el = document.getElementById("actionButtonsContainer"); if (el) el.remove(); } catch(e){}
  }, 700);

  // overlay finale
  setTimeout(() => {
    let overlay = document.getElementById("endingOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "endingOverlay";
      overlay.style.position = "fixed";
      overlay.style.left = "50%";
      overlay.style.top = "50%";
      overlay.style.transform = "translate(-50%, -50%)";
      overlay.style.display = "flex";
      overlay.style.flexDirection = "column";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.gap = "18px";
      overlay.style.zIndex = 20000;
      overlay.style.opacity = "0";
      overlay.style.transition = "opacity 900ms ease, transform 900ms ease";
      document.body.appendChild(overlay);
    } else {
      overlay.innerHTML = "";
      overlay.style.opacity = "0";
    }

    const title = document.createElement("div");
    title.textContent = titleText;
    title.style.fontFamily = "sans-serif";
    title.style.fontWeight = "900";
    title.style.fontSize = "64px";
    title.style.color = titleColor;
    title.style.textAlign = "center";
    title.style.textShadow = "0 6px 18px rgba(0,0,0,0.45)";

    const subtitle = document.createElement("div");
    subtitle.textContent = subtitleText;
    subtitle.style.fontFamily = "sans-serif";
    subtitle.style.fontWeight = "600";
    subtitle.style.fontSize = "20px";
    subtitle.style.color = "#ffffff";
    subtitle.style.opacity = "0.95";
    subtitle.style.textAlign = "center";

    overlay.appendChild(title);
    overlay.appendChild(subtitle);

    setTimeout(() => {
      overlay.style.opacity = "1";
      overlay.style.transform = "translate(-50%, -50%)";
    }, 60);
  }, 820);
}

// play cryfound
function playCryFound() {
  try {
    var desc = {};
    var res = gSystem.getEvent("event:/cryfound", desc);
    if (res !== FMOD.OK) { console.warn("cryfound missing", res); return; }
    var instObj = {};
    var createRes = desc.val.createInstance(instObj);
    if (createRes !== FMOD.OK) { console.warn("cryfound create failed", createRes); return; }
    var inst = instObj.val;
    try { inst.start(); } catch(e){ console.warn("cryfound start threw", e); }
    try { gSystem.update(); } catch(e){}
  } catch (e) { console.warn("playCryFound error", e); }
}

// update / encounter logic
function checkEncounters() {
  if (!window.listenerPos) return;
  if (window.monsterEvents && window.monsterEvents.length) {
    window.monsterEvents.forEach(ev => {
      try {
        if (ev._isEncountered) return;
        const screen = worldToScreen(ev.position.x, ev.position.z);
        const listenerScreen = worldToScreen(window.listenerPos.x, window.listenerPos.z);
        const dx = screen.clientX - listenerScreen.clientX, dy = screen.clientY - listenerScreen.clientY;
        const screenD = Math.sqrt(dx*dx + dy*dy);
        const STOP_THRESHOLD_PX = 20;
        if (screenD <= STOP_THRESHOLD_PX) {
          ev._isEncountered = true;
          try { if (ev.instance && typeof ev.instance.stop === "function") ev.instance.stop(FMOD.STOP_ALLOWFADEOUT); } catch(e){}
          try { playCryFound(); } catch(e){}
        }
      } catch(e){}
    });
  }

  if (!currentMonster) return;
  if (!currentMonster._started || currentMonster._isStopped) return;
  const listenerScreen = worldToScreen(window.listenerPos.x, window.listenerPos.z);
  const evScreenPos = currentMonster.screenPos;
  if (!evScreenPos) return;
  const dx = evScreenPos.clientX - listenerScreen.clientX, dy = evScreenPos.clientY - listenerScreen.clientY;
  const screenD = Math.sqrt(dx*dx + dy*dy);
  const STOP_THRESHOLD_PX = 20;
  if (screenD <= STOP_THRESHOLD_PX) {
    currentMonster._isStopped = true;
    resolveCurrentMonster && resolveCurrentMonster();
  }
}

function updateApplication() {
  try { checkEncounters(); } catch(e){}
  try { gSystem.update(); } catch(e){}
}

// onAudioUnlocked
window.onAudioUnlocked = function() {
  try {
    window.__audioUnlocked = true;
    console.log("onAudioUnlocked: audio unlocked flag set");
    try {
      if (ambienceInstance && typeof ambienceInstance.start === "function") {
        ambienceInstance.start();
        console.log("Ambience started after unlock");
        try { gSystem.update(); } catch(e){}
      }
    } catch(e){ console.warn("Ambience start after unlock failed", e); }

    try {
      if (window.listenerPos) {
        var attributes = FMOD._3D_ATTRIBUTES();
        setVector(attributes.position, window.listenerPos.x, 0, window.listenerPos.z);
        setVector(attributes.velocity, 0,0,0);
        setVector(attributes.forward, 0,0,1);
        setVector(attributes.up, 0,1,0);
        gSystem.setListenerAttributes(0, attributes, null);
        console.log("Listener attributes re-applied after unlock");
      }
    } catch(e){ console.warn("reapply listener failed", e); }

    try { gSystem.update(); } catch(e){}
  } catch (err) {
    console.warn("onAudioUnlocked error", err);
  }
};

// diagnostics
window.runQuickDiagnostics = function() {
  console.log("Running quick diagnostics...");
  const events = ["event:/step","event:/knock","event:/monstercry","event:/cabin","event:/cabindialogue"];
  events.forEach((p) => {
    try {
      var desc = {};
      var r = gSystem.getEvent(p, desc);
      console.log("getEvent", p, "->", r, desc && !!desc.val);
      if (r !== FMOD.OK) return;
      var instObj = {};
      var cr = desc.val.createInstance(instObj);
      console.log("createInstance", p, "->", cr);
      if (cr !== FMOD.OK) return;
      var inst = instObj.val;
      try { inst.start(); console.log("start called for", p); } catch(e){ console.warn("start threw", e); }
      try { gSystem.update(); } catch(e){}
      setTimeout(() => {
        try {
          var st = {}; inst.getPlaybackState(st); console.log("playbackState", p, "=", st.val);
          var pos = {}; inst.getTimelinePosition(pos); console.log("timelinePosition", p, "=", pos.val);
        } catch(e){ console.warn("state check failed", e); }
      }, 250);
    } catch(e){ console.warn("diag error for", p, e); }
  });

  ["inout","safezone","hit","ending","animals","rain"].forEach(name => {
    try {
      var out = {};
      if (gSystem.getParameterByName) {
        const res = gSystem.getParameterByName(name, out);
        console.log("param", name, "->", res, out && out.val);
      }
    } catch(e){ console.warn("param read failed", name, e); }
  });
};

window.debugMonsterState = function() { console.log({ resolvedMonsters, currentMonster, monsterEvents: window.monsterEvents && window.monsterEvents.length, activeSpawn: !!window.activeSpawn }); };
window.resetMonsters = function() { resolvedMonsters = 0; (window.monsterEvents||[]).forEach(ev => { try { if (ev.markerEl) ev.markerEl.remove(); } catch(e){} try { if (ev.instance && typeof ev.instance.stop === "function") ev.instance.stop(FMOD.STOP_ALLOWFADEOUT); } catch(e){} }); window.monsterEvents = []; if (window.activeSpawn && window.activeSpawn.instance) try { window.activeSpawn.instance.stop(FMOD.STOP_ALLOWFADEOUT); } catch(e){} window.activeSpawn = null; if (currentMonster && currentMonster.instance) try { currentMonster.instance.stop(FMOD.STOP_ALLOWFADEOUT); } catch(e){} currentMonster = null; resolvedMonsters = 0; window.resolvedMonsters = 0; };
window.gSystem = gSystem;
