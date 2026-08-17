// ui.js — unified, defensive, cleaned version
(function() {
  window.inputLocked = true;
  function blockInput(e) { if (window.inputLocked) { e.stopPropagation(); e.preventDefault(); } }
  document.addEventListener("click", blockInput, true);
  document.addEventListener("touchstart", blockInput, true);
	
window._disableActionHeader = false;

  window.addEventListener("load", () => {
    // Defensive DOM bindings
    const unlock = document.getElementById("audioUnlock") || null;
    const intro = document.getElementById("introText") || null;
    const tap = document.getElementById("tapText") || null;
    const ui = document.getElementById("uiContainer") || null;
    const walkBtn = document.getElementById("walkButton") || null;
    const floating = document.getElementById("floatingTextContainer") || null;
    const cabinText = document.getElementById("cabinText") || null;
    const knockBtn = document.getElementById("knockButton") || null;
    const fmodLogo = document.getElementById("fmodLogo") || null;

    let walkCount = 0;
    let floatingInterval = null;

    if (walkBtn) { walkBtn.style.pointerEvents = "none"; walkBtn.style.opacity = "0"; }

    setTimeout(() => { if (intro) intro.style.opacity = 1; }, 1000);
    setTimeout(() => { if (intro) intro.style.opacity = 0; }, 4000);
    setTimeout(() => { if (fmodLogo) fmodLogo.style.opacity = 1; }, 4500);
    setTimeout(() => { if (fmodLogo) fmodLogo.style.opacity = 0; }, 6800);

    setTimeout(() => {
      if (tap) try { tap.style.opacity = 1; } catch(e){}
      window.inputLocked = false;
      console.log("Input unlocked (UI)");
    }, 7300);

    const unlockAudio = () => {
      try { if (typeof window.gSystem !== "undefined") window.gSystem.update(); } catch(e){}
      window.__audioUnlocked = true;
      try { if (typeof window.onAudioUnlocked === "function") window.onAudioUnlocked(); } catch(e){ console.warn("onAudioUnlocked call failed", e); }
      if (tap) try { tap.style.opacity = 0; } catch(e){}
      if (unlock && unlock.parentNode) try { unlock.parentNode.removeChild(unlock); } catch(e){}
      try { startUISequence(); } catch(e){ console.warn("startUISequence missing", e); }
    };

    if (unlock) {
      unlock.addEventListener("click", unlockAudio);
      unlock.addEventListener("touchstart", unlockAudio);
    } else {
      setTimeout(unlockAudio, 300);
    }

    function startUISequence() {
      setTimeout(() => { if (ui) ui.style.opacity = 1; }, 300);
      setTimeout(() => {
        if (walkBtn) {
          walkBtn.style.opacity = 1;
          walkBtn.style.pointerEvents = "auto";
          if (!walkBtn.__walkHandlerAttached) {
            walkBtn.addEventListener("click", handleWalkClick);
            walkBtn.addEventListener("touchstart", handleWalkClick);
            walkBtn.__walkHandlerAttached = true;
          }
        }
        startFloatingText();
      }, 800);
    }

    function startFloatingText() {
      try { if (floatingInterval) clearInterval(floatingInterval); } catch(e){}
      floatingInterval = setInterval(() => {
        try { if (floating && floating.childElementCount < 2) spawnFloatingText(); } catch(e){}
      }, 1200);
    }

    function spawnFloatingText() {
      try {
        if (!floating) return;
        const txt = document.createElement("div");
        txt.className = "floatingText";
        txt.textContent = "venture into the woods";
        const x = Math.random() * 80 + 10;
        const y = Math.random() * 80 + 10;
        txt.style.left = x + "%";
        txt.style.top = y + "%";
        floating.appendChild(txt);
        setTimeout(() => txt.style.opacity = 1, 50);
        setTimeout(() => txt.style.opacity = 0, 2000);
        setTimeout(() => { try { if (txt.parentNode) txt.parentNode.removeChild(txt); } catch(e){} }, 3500);
      } catch(e){ console.warn("spawnFloatingText failed", e); }
    }

    function handleWalkClick() {
      walkCount++;
      console.log("WALK CLICK:", walkCount);
      try {
        if (window.__audioUnlocked && window.stepInstance && typeof window.stepInstance.start === "function") {
          window.stepInstance.start();
          try { if (window.gSystem && typeof window.gSystem.update === "function") window.gSystem.update(); } catch(e){}
        }
      } catch (e) { console.warn("step start error", e); }

      if (walkCount >= 15) {
        try {
          if (typeof window.playCabinEvent === "function") {
            console.log("UI: calling playCabinEvent()");
            window.playCabinEvent();
          } else {
            console.warn("playCabinEvent not available from main");
          }
        } catch (e) { console.warn("playCabinEvent call failed", e); }
        triggerCabinScene();
      }
    }

    // ---------- triggerCabinScene + knock flow ----------
    function triggerCabinScene() {
      try {
        clearInterval(floatingInterval);
        if (floating) floating.innerHTML = "";
        if (walkBtn) { walkBtn.style.opacity = 0; walkBtn.style.pointerEvents = "none"; }
        setTimeout(() => { if (cabinText) cabinText.style.opacity = 1; }, 1000);
        setTimeout(() => { if (knockBtn) { knockBtn.style.opacity = 1; knockBtn.style.pointerEvents = "auto"; } }, 2000);
      } catch (e) { console.warn("triggerCabinScene error", e); }
    }

    if (knockBtn) {
      if (!knockBtn.__knockHandlerAttached) {
        knockBtn.__knockHandlerAttached = true;
        knockBtn.addEventListener("click", () => {
          try {
            if (typeof window.playKnockEvent === "function") {
              try { window.playKnockEvent(); } catch(e){ console.warn("playKnockEvent threw", e); }
              try { window.gSystem && window.gSystem.update(); } catch(e){}
            }

            if (cabinText) cabinText.style.opacity = 0;
            knockBtn.style.opacity = 0;
            knockBtn.style.pointerEvents = "none";
            if (ui) ui.style.opacity = 0;

            const POLL_INTERVAL = 50, MAX_WAIT_MS = 4000;
            let elapsed = 0, playedOnce = false;
            if (typeof window.__inoutRunning === "undefined") window.__inoutRunning = false;

            function startInoutIncrement() {
              if (window.__inoutRunning) {
                console.log("inout increment already running, skip");
                return;
              }
              window.__inoutRunning = true;
              console.log("Starting inout increment (4s)");

              const setByName = (window.gSystem && typeof window.gSystem.setParameterByName === "function");
              const setByID = (typeof window.inoutID !== "undefined" && window.gSystem && typeof window.gSystem.setParameterByID === "function");

              if (!setByName && !setByID) {
                console.warn("No API available to set inout parameter");
                window.__inoutRunning = false;
                return;
              }

              try {
                if (setByName) window.gSystem.setParameterByName("inout", 0, false);
                else window.gSystem.setParameterByID(window.inoutID, 0, false);
                try { window.gSystem.update(); } catch(e){}
              } catch(e){ console.warn("initial set inout failed", e); }

              let v = 0;
              const stepMs = 100;
              const stepAmount = 0.025;
              const maxSteps = Math.ceil(1 / stepAmount) + 2;
              let steps = 0;

              const inc = setInterval(() => {
                steps++;
                v = Math.min(1, v + stepAmount);
                try {
                  if (setByName) window.gSystem.setParameterByName("inout", v, false);
                  else window.gSystem.setParameterByID(window.inoutID, v, false);
                  try { window.gSystem.update(); } catch(e){}
                  console.log("inout ->", v.toFixed(3));
                } catch (err) {
                  console.warn("Error setting inout:", err);
                }

                if (v >= 1 || steps >= maxSteps) {
                  clearInterval(inc);
                  window.__inoutRunning = false;
                  console.log("inout increment finished (v=", v, "steps=", steps, ")");
                  try {
                    if (typeof window.playCabinDialogueEvent === "function") {
                      window.playCabinDialogueEvent();
                      try { window.gSystem.update(); } catch(e){}
                    } else if (typeof window.safeCreateAndStart === "function") {
                      window.safeCreateAndStart("event:/cabindialogue");
                      try { window.gSystem.update(); } catch(e){}
                    } else {
                      try {
                        var desc = {};
                        const r = window.gSystem.getEvent("event:/cabindialogue", desc);
                        if (r === window.FMOD.OK && desc && desc.val && typeof desc.val.createInstance === "function") {
                          var instObj = {};
                          const cr = desc.val.createInstance(instObj);
                          if (cr === window.FMOD.OK && instObj.val && typeof instObj.val.start === "function") {
                            instObj.val.start();
                            try { window.gSystem.update(); } catch(e){}
                            console.log("Direct started event:/cabindialogue after ramp");
                          }
                        } else {
                          console.warn("Direct getEvent for cabindialogue failed or not available");
                        }
                      } catch(e){ console.warn("Direct start event:/cabindialogue after ramp threw", e); }
                    }
                  } catch(e){ console.warn("Error calling cabindialogue fallback after ramp", e); }
                }
              }, stepMs);

              setTimeout(() => {
                try { clearInterval(inc); } catch(e){}
                window.__inoutRunning = false;
                console.warn("inout increment safety timeout reached");
              }, 7000);
            } // end startInoutIncrement

            try {
              const inst = (typeof window.knockInstanceRef === "function") ? window.knockInstanceRef() : null;
              if (inst && typeof inst.setCallback === "function" && !inst.__callbackRegistered) {
                inst.setCallback((eventType) => {
                  if (eventType === window.FMOD.STUDIO_EVENT_CALLBACK_STARTED) playedOnce = true;
                  if (eventType === window.FMOD.STUDIO_EVENT_CALLBACK_STOPPED && playedOnce) startInoutIncrement();
                }, window.FMOD.STUDIO_EVENT_CALLBACK_STARTED | window.FMOD.STUDIO_EVENT_CALLBACK_STOPPED);
                inst.__callbackRegistered = true;
              }
            } catch(cbErr) { console.warn("knock callback attach error", cbErr); }

            const poll = setInterval(() => {
              try {
                elapsed += POLL_INTERVAL;
                const i = (typeof window.knockInstanceRef === "function") ? window.knockInstanceRef() : null;
                if (!i) {
                  if (elapsed >= MAX_WAIT_MS && !playedOnce) { clearInterval(poll); startInoutIncrement(); }
                  return;
                }
                try {
                  var posObj = {}; i.getTimelinePosition(posObj);
                  if (posObj && typeof posObj.val !== "undefined" && posObj.val > 0) playedOnce = true;
                } catch(e){}
                try {
                  var stateObj = {}; i.getPlaybackState(stateObj);
                  if (stateObj && typeof stateObj.val !== "undefined" && stateObj.val === window.FMOD.STUDIO_PLAYBACK_STOPPED && playedOnce) {
                    clearInterval(poll);
                    startInoutIncrement();
                  }
                } catch(e){}
                if (elapsed >= MAX_WAIT_MS && !playedOnce) { clearInterval(poll); startInoutIncrement(); }
              } catch(e) {
                console.warn("knock poll error", e);
                clearInterval(poll);
                startInoutIncrement();
              }
            }, POLL_INTERVAL);

          } catch (outer) {
            console.warn("knockBtn click outer error", outer);
          }
        });
      }
    } // end knockBtn

    // ---------- createActionButtons ----------
    window.createActionButtons = function() {
  if (window._disableActionHeader) return; 
      try {
        if (document.getElementById("actionButtonsContainer")) return;

        const container = document.createElement("div");
        container.id = "actionButtonsContainer";
        container.style.position = "fixed";
        container.style.left = "50%";
        container.style.bottom = "12%";
        container.style.transform = "translateX(-50%)";
        container.style.display = "flex";
        container.style.gap = "18px";
        container.style.zIndex = 11000;
        container.style.opacity = "0";
        container.style.transition = "opacity 1000ms ease";
        document.body.appendChild(container);

        const baseStyle = {
          padding: "12px 20px",
          background: "rgba(255,255,255,0.95)",
          border: "2px solid rgba(0,0,0,0.08)",
          borderRadius: "8px",
          fontFamily: "sans-serif",
          fontWeight: "700",
          fontSize: "16px",
          cursor: "pointer",
          boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
          color: "#042",
          userSelect: "none"
        };

        function makeButton(text, id) {
          const b = document.createElement("button");
          b.id = id;
          b.textContent = text;
          Object.assign(b.style, baseStyle);
          b.style.opacity = "0";
          b.style.transition = "opacity 1000ms ease, transform 300ms ease";
          b.style.pointerEvents = "auto";
          return b;
        }

        const runBtn = makeButton("RUN", "runButton");
        const swingBtn = makeButton("SWING YOUR AXE", "swingButton");
        container.appendChild(runBtn);
        container.appendChild(swingBtn);

        setTimeout(() => {
          container.style.opacity = "1";
          setTimeout(() => { runBtn.style.opacity = "1"; }, 120);
          setTimeout(() => { swingBtn.style.opacity = "1"; }, 260);
        }, 40);

        // header
        try {
	if (!window._disableActionHeader) {
          if (!document.getElementById("actionHeader")) {
            const actionHeader = document.createElement("div");
            actionHeader.id = "actionHeader";
            actionHeader.textContent = "hit the creatures attacking you when they are close to you";
            actionHeader.style.position = "fixed";
            actionHeader.style.left = "50%";
            actionHeader.style.top = "6%";
            actionHeader.style.transform = "translateX(-50%)";
            actionHeader.style.zIndex = 13000;
            actionHeader.style.fontFamily = "sans-serif";
            actionHeader.style.fontWeight = "900";
            actionHeader.style.fontSize = "20px";
            actionHeader.style.color = "#ffffff";
            actionHeader.style.textShadow = "0 6px 18px rgba(0,0,0,0.6)";
            actionHeader.style.opacity = "0";
            actionHeader.style.transition = "opacity 400ms ease, transform 400ms ease";
            document.body.appendChild(actionHeader);
            setTimeout(() => { actionHeader.style.opacity = "1"; actionHeader.style.transform = "translateX(-50%) translateY(0)"; }, 120);
          }
	}
        } catch(e){ console.warn("createActionButtons: actionHeader create failed", e); }

        // spawn run floating
        try {
          function spawnRunFloatingText() {
            try {
              const fContainer = document.getElementById("floatingTextContainer") || (function(){
                const el = document.createElement("div");
                el.id = "floatingTextContainer";
                el.style.position = "fixed";
                el.style.left = "0";
                el.style.top = "0";
                el.style.width = "100%";
                el.style.height = "100%";
                el.style.pointerEvents = "none";
                el.style.zIndex = 12050;
                document.body.appendChild(el);
                return el;
              })();

              const txt = document.createElement("div");
              txt.className = "floatingText runFloating";
              txt.textContent = "run for your life";
              const x = Math.random() * 80 + 10;
              const y = Math.random() * 70 + 15;
              txt.style.position = "fixed";
              txt.style.left = x + "%";
              txt.style.top = y + "%";
              txt.style.opacity = "0";
              txt.style.transition = "opacity 300ms ease, transform 2000ms ease";
              txt.style.transform = "translateY(6px)";
              txt.style.fontFamily = "sans-serif";
              txt.style.fontWeight = "800";
              txt.style.fontSize = "18px";
              txt.style.color = "#ffef6b";
              txt.style.textShadow = "0 6px 18px rgba(0,0,0,0.35)";
              txt.style.pointerEvents = "none";
              fContainer.appendChild(txt);

              setTimeout(() => { txt.style.opacity = "1"; txt.style.transform = "translateY(0)"; }, 50);
              setTimeout(() => { txt.style.opacity = "0"; txt.style.transform = "translateY(-8px)"; }, 2000);
              setTimeout(() => { try { if (txt.parentNode) txt.parentNode.removeChild(txt); } catch(e){} }, 2600);
            } catch(e){ console.warn("spawnRunFloatingText failed", e); }
          }

          try { if (window._runFloatingInterval) { clearInterval(window._runFloatingInterval); window._runFloatingInterval = null; } } catch(e){}

          window._runFloatingInterval = setInterval(() => {
            if (Math.random() < 0.85) spawnRunFloatingText();
          }, 1200 + Math.floor(Math.random() * 1300));
        } catch(e){ console.warn("createActionButtons: run floating setup failed", e); }

        // expose references
        window._actionButtons = { container, runBtn, swingBtn };

        // attach default handlers if available
        if (typeof window.handleRunClick === "function" && !runBtn.__handlerAttached) {
          runBtn.addEventListener("click", window.handleRunClick);
          runBtn.addEventListener("touchstart", window.handleRunClick);
          runBtn.__handlerAttached = true;
        }

        if (typeof window.onPlayerSwing === "function" && !swingBtn.__handlerAttached) {
          swingBtn.addEventListener("click", function() {
            try {
              try {
                if (window.gSystem && typeof window.gSystem.setParameterByName === "function") {
                  window.gSystem.setParameterByName("hit", 1, false);
                  try { window.gSystem.update(); } catch(e){}
                  setTimeout(() => { try { window.gSystem.setParameterByName("hit", 0, false); try { window.gSystem.update(); } catch(e){} } catch(e){} }, 20);
                } else if (typeof window.hitID !== "undefined" && window.gSystem && typeof window.gSystem.setParameterByID === "function") {
                  window.gSystem.setParameterByID(window.hitID, 1, false);
                  try { window.gSystem.update(); } catch(e){}
                  setTimeout(() => { try { window.gSystem.setParameterByID(window.hitID, 0, false); try { window.gSystem.update(); } catch(e){} } catch(e){} }, 20);
                }
              } catch(err){ console.warn("swing param error", err); }

              try { if (typeof window.playEventOnce === "function") window.playEventOnce("event:/swing"); } catch(e){ console.warn("play swing failed", e); }

              try { window.onPlayerSwing(); } catch(e){ console.warn("onPlayerSwing threw", e); }
            } catch(e){ console.warn("swingBtn click wrapper error", e); }
          });
          swingBtn.__handlerAttached = true;
        }

      } catch(e) {
        console.warn("createActionButtons error", e);
      }
    }; // end createActionButtons

   // ---------- attach RUN handler (versione corretta) ----------
(function attachRunHandler() {
  var runBtnRef =
    (window._actionButtons && window._actionButtons.runBtn) ||
    document.getElementById("runButton");

  if (!runBtnRef) { setTimeout(attachRunHandler, 200); return; }
  if (runBtnRef.__runHandlerAttached) return;
  runBtnRef.__runHandlerAttached = true;

  runBtnRef.addEventListener("click", function() {
    try {
      // eventuale override esterno
      if (typeof window.handleRunClick === "function") {
        try { window.handleRunClick(); return; }
        catch(e){ console.warn("handleRunClick threw", e); }
      }

      // step sound
      try {
        if (window.stepInstance && typeof window.stepInstance.start === "function") {
          window.stepInstance.start();
          try { window.gSystem.update(); } catch(e){}
        }
      } catch(e){ console.warn("step start error", e); }

      // --- READ safezonepar ---
      var curVal = 0;
      var readOk = false;

      try {
        if (typeof window.safeGetParameter === "function") {
          var res = window.safeGetParameter("safezonepar");
          if (res && res.ok) { curVal = Number(res.val) || 0; readOk = true; }
        }
      } catch(e){}

      if (!readOk) {
        try {
          if (window.gSystem && typeof window.gSystem.getParameterByName === "function") {
            var out = {};
            var r = window.gSystem.getParameterByName("safezonepar", out, 0);
            if (r === window.FMOD.OK && out && typeof out.val !== "undefined") {
              curVal = Number(out.val) || 0;
              readOk = true;
            }
          }
        } catch(e){}
      }

      // --- WRITE safezonepar ---
      var next = Math.min(1, curVal + 0.02);

      try {
        if (typeof window.safeSetParameter === "function") {
          window.safeSetParameter("safezonepar", next);
        } else if (window.gSystem && typeof window.gSystem.setParameterByName === "function") {
          window.gSystem.setParameterByName("safezonepar", next, false);
          window.gSystem.update();
        }
      } catch(e){}

      console.log("RUN pressed -> safezonepar:", curVal, "->", next);

      // --- SAFE ENDING ---
      if (next >= 1) {
        triggerSafeEnding();
        return;
      }

    } catch (outer) {
      console.warn("RUN click outer error", outer);
    }
  });
})();


    // ---------- SWING handler (global install) ----------
    (function installSwingHandler() {
      var swingBtnRef = (window._actionButtons && window._actionButtons.swingBtn) || document.getElementById("swingButton");
      if (!swingBtnRef) { setTimeout(installSwingHandler, 200); return; }
      if (swingBtnRef.__swingHandlerAttached) return;
      swingBtnRef.__swingHandlerAttached = true;

      var _swingLocked = false;
      swingBtnRef.addEventListener("click", function() {
        try {
          if (_swingLocked) return;
          _swingLocked = true;
          setTimeout(function(){ _swingLocked = false; }, 120);

          try {
            if (window.gSystem && typeof window.gSystem.setParameterByName === "function") {
              window.gSystem.setParameterByName("hit", 1, false);
              try { window.gSystem.update(); } catch(e){}
              setTimeout(function() {
                try { window.gSystem.setParameterByName("hit", 0, false); try { window.gSystem.update(); } catch(e){} } catch(e){}
              }, 20);
            } else if (typeof window.hitID !== "undefined" && window.gSystem && typeof window.gSystem.setParameterByID === "function") {
              window.gSystem.setParameterByID(window.hitID, 1, false);
              try { window.gSystem.update(); } catch(e){}
              setTimeout(function() {
                try { window.gSystem.setParameterByID(window.hitID, 0, false); try { window.gSystem.update(); } catch(e){} } catch(e){}
              }, 20);
            }
          } catch (err) {
            console.warn("SWING param hit error", err);
          }

          try {
            if (typeof window.playEventOnce === "function") {
              window.playEventOnce("event:/swing");
            } else if (window.gSystem && typeof window.gSystem.getEvent === "function") {
              var desc = {};
              var r = window.gSystem.getEvent("event:/swing", desc);
              if (r === window.FMOD.OK && desc && desc.val && typeof desc.val.createInstance === "function") {
                var instObj = {};
                var cr = desc.val.createInstance(instObj);
                if (cr === window.FMOD.OK && instObj.val) {
                  try { instObj.val.start(); try { window.gSystem.update(); } catch(e){} } catch(e){}
                }
              }
            }
          } catch(e) { console.warn("play swing error", e); }

try {
    window.onPlayerSwing();
} catch(e){
    console.warn("onPlayerSwing threw", e);
}

        } catch (outer) {
          console.warn("SWING click outer error", outer);
        }
      });
    })();

    // ---------- hideActionButtons and drag button ----------
    window.hideActionButtons = function() {
      try {
        const container = document.getElementById("actionButtonsContainer");
        if (!container) return;
        container.style.transition = "opacity 700ms ease, transform 700ms ease";
        container.style.opacity = "0";
        container.style.transform = "translateY(12px) scale(0.98)";
        setTimeout(() => { try { if (container.parentNode) container.parentNode.removeChild(container); } catch(e){} }, 800);
      } catch(e) { console.warn("hideActionButtons error", e); }

      try {
        if (window._runFloatingInterval) {
          try { clearInterval(window._runFloatingInterval); } catch(e){}
          window._runFloatingInterval = null;
        }
        const actionHeader = document.getElementById("actionHeader");
        if (actionHeader) {
          try {
            actionHeader.style.transition = "opacity 400ms ease, transform 400ms ease";
            actionHeader.style.opacity = "0";
            actionHeader.style.transform = "translateX(-50%) translateY(-6px)";
            setTimeout(() => { try { if (actionHeader.parentNode) actionHeader.parentNode.removeChild(actionHeader); } catch(e){} }, 420);
          } catch(e){ try { if (actionHeader.parentNode) actionHeader.parentNode.removeChild(actionHeader); } catch(e){} }
        }
        try {
          const fContainer = document.getElementById("floatingTextContainer");
          if (fContainer && fContainer.childElementCount === 0) {
            try { if (fContainer.parentNode) fContainer.parentNode.removeChild(fContainer); } catch(e){}
          }
        } catch(e){}
      } catch(e) { console.warn("hideActionButtons cleanup error", e); }
    };

    window.showDragMonsterButton = function() {
      try {
        if (document.getElementById("dragMonsterBtn")) return;
        const DROP_PIXEL_THRESHOLD = 150;

        let header = document.getElementById("monsterHeader");
        if (!header) {
          header = document.createElement("div");
          header.id = "monsterHeader";
          header.textContent = "where are these cries coming from?";
          header.style.position = "fixed";
          header.style.left = "50%";
          header.style.top = "6%";
          header.style.transform = "translateX(-50%)";
          header.style.zIndex = 13000;
          header.style.fontFamily = "sans-serif";
          header.style.fontWeight = "900";
          header.style.fontSize = "28px";
          header.style.color = "#fff";
          header.style.textShadow = "0 6px 18px rgba(0,0,0,0.6)";
          header.style.opacity = "0";
          header.style.transition = "opacity 400ms ease";
          document.body.appendChild(header);
          setTimeout(() => { header.style.opacity = "1"; }, 40);
        }

        const btn = document.createElement("button");
        btn.id = "dragMonsterBtn";
        btn.textContent = "DRAG ME";
        btn.style.position = "fixed";
        btn.style.left = "50%";
        btn.style.top = "18%";
        btn.style.transform = "translate(-50%, -50%)";
        btn.style.zIndex = 12000;
        btn.style.padding = "10px 14px";
        btn.style.borderRadius = "8px";
        btn.style.fontWeight = "800";
        btn.style.cursor = "grab";
        btn.style.userSelect = "none";
        btn.style.transition = "opacity 200ms ease, transform 120ms ease";
        btn.style.opacity = "0";
        btn.style.touchAction = "none";
        document.body.appendChild(btn);
        setTimeout(() => { btn.style.opacity = "1"; }, 40);

        try {
          if (typeof window.spawnSingleMonsterRandom === "function") {
            window.spawnSingleMonsterRandom(60);
          } else {
            console.warn("spawnSingleMonsterRandom not available");
          }
        } catch(e){ console.warn("initial spawnSingleMonsterRandom failed", e); }

        let dragging = false;
        let offsetX = 0, offsetY = 0;

        function getBtnCenter() {
          const rect = btn.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }

        function updateListenerFromScreen(screenX, screenY) {
          try {
            const world = screenToWorld(screenX, screenY);
            window.listenerPos = world;
            try {
              var attributes = FMOD._3D_ATTRIBUTES();
              setVector(attributes.position, world.x, 0, world.z);
              setVector(attributes.velocity, 0, 0, 0);
              setVector(attributes.forward, 0, 0, 1);
              setVector(attributes.up, 0, 1, 0);
              if (gSystem && typeof gSystem.setListenerAttributes === "function") {
                gSystem.setListenerAttributes(0, attributes, null);
                try { gSystem.update(); } catch(e){}
              }
            } catch (e) { /* non-blocking */ }
          } catch (e) { console.warn("updateListenerFromScreen failed", e); }
        }

        btn.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          dragging = true;
          btn.style.cursor = "grabbing";
          const rect = btn.getBoundingClientRect();
          offsetX = ev.clientX - rect.left;
          offsetY = ev.clientY - rect.top;
          const center = getBtnCenter();
          updateListenerFromScreen(center.x, center.y);
        });

        window.addEventListener("mousemove", (ev) => {
          if (!dragging) return;
          ev.preventDefault();
          const x = ev.clientX - offsetX;
          const y = ev.clientY - offsetY;
          btn.style.left = (x + btn.offsetWidth/2) + "px";
          btn.style.top = (y + btn.offsetHeight/2) + "px";
          btn.style.transform = "translate(-50%, -50%)";
          const center = getBtnCenter();
          updateListenerFromScreen(center.x, center.y);
        });

        window.addEventListener("mouseup", (ev) => {
          if (!dragging) return;
          dragging = false;
          btn.style.cursor = "grab";
          const center = getBtnCenter();
          updateListenerFromScreen(center.x, center.y);
          try {
            if (!window.activeSpawn || !window.activeSpawn.screenPos) {
              console.warn("No activeSpawn available on drop");
            } else {
              const dx = center.x - window.activeSpawn.screenPos.clientX;
              const dy = center.y - window.activeSpawn.screenPos.clientY;
              const pixelDist = Math.sqrt(dx*dx + dy*dy);
              console.log("drop pixel dist to activeSpawn:", pixelDist);
              if (pixelDist <= DROP_PIXEL_THRESHOLD) {
                try {
                  if (window.activeSpawn && window.activeSpawn.instance && typeof window.activeSpawn.instance.stop === "function") {
                    window.activeSpawn.instance.stop(FMOD.STOP_ALLOWFADEOUT);
                  }
                } catch(e){ console.warn("stop activeSpawn failed", e); }
                try { if (typeof playCryFound === "function") playCryFound(); } catch(e){ console.warn("playCryFound failed", e); }

                window.activeSpawn = null;
                window.resolvedMonsters = (window.resolvedMonsters || 0) + 1;
                console.log("resolvedMonsters ->", window.resolvedMonsters);

                if ((window.resolvedMonsters || 0) >= (typeof totalMonsters !== "undefined" ? totalMonsters : 4)) {
                  try {
                    if (header) { header.style.transition = "opacity 800ms ease"; header.style.opacity = "0"; }
                    if (btn) { btn.style.transition = "opacity 800ms ease, transform 800ms ease"; btn.style.opacity = "0"; btn.style.transform = "translate(-50%, -40%) scale(0.98)"; }
                  } catch(e){}
                  setTimeout(() => {
                    try { if (header && header.parentNode) header.parentNode.removeChild(header); } catch(e){}
                    try { if (btn && btn.parentNode) btn.parentNode.removeChild(btn); } catch(e){}
                  }, 900);

                  try {
                    const inst = (typeof window.safeCreateAndStart === "function") ? window.safeCreateAndStart("event:/cabindialogue2") : null;
                    if (inst && typeof inst.setCallback === "function") {
                      inst.setCallback((eventType) => {
                        if (eventType === window.FMOD.STUDIO_EVENT_CALLBACK_STOPPED) {
                          try { rampInoutToZero(2000); } catch(e){}
                          setTimeout(() => { try { if (typeof window.createActionButtons === "function") window.createActionButtons(); } catch(e){} }, 300);
                          setTimeout(() => {
                            try {
                              if (typeof window.startCreatureEvent === "function") {
                                const inst = window.startCreatureEvent();
                                if (!inst) {
                                  setTimeout(() => { if (window._lastCreatureInstance) attachCreatureStopHandler(window._lastCreatureInstance); }, 300);
                                }
                              }
                            } catch(e){}
                          }, 900);
                        }
                      }, window.FMOD.STUDIO_EVENT_CALLBACK_STOPPED);
                    } else {
                      rampInoutToZero(2000);
                      setTimeout(() => { try { if (typeof window.createActionButtons === "function") window.createActionButtons(); } catch(e){} }, 300);
                      setTimeout(() => {
                        try {
                          if (typeof window.startCreatureEvent === "function") {
                            const inst = window.startCreatureEvent();
                            if (!inst) {
                              setTimeout(() => { if (window._lastCreatureInstance) attachCreatureStopHandler(window._lastCreatureInstance); }, 300);
                            }
                          }
                        } catch(e){}
                      }, 900);
                    }
                  } catch(e){ console.warn("play cabindialogue2 failed", e); }
                  return;
                }

                try { if (typeof window.spawnSingleMonsterRandom === "function") window.spawnSingleMonsterRandom(60); } catch(e){ console.warn("spawnSingleMonsterRandom after success failed", e); }
              } else {
                console.log("drop too far (>threshold), no action");
              }
            }
          } catch(e){ console.warn("drop handling failed", e); }
        });

        // touch handlers
        btn.addEventListener("touchstart", (ev) => {
          ev.preventDefault();
          dragging = true;
          btn.style.cursor = "grabbing";
          const t = ev.touches[0];
          const rect = btn.getBoundingClientRect();
          offsetX = t.clientX - rect.left;
          offsetY = t.clientY - rect.top;
          const center = getBtnCenter();
          updateListenerFromScreen(center.x, center.y);
        }, { passive: false });

        window.addEventListener("touchmove", (ev) => {
          if (!dragging) return;
          ev.preventDefault();
          const t = ev.touches[0];
          const x = t.clientX - offsetX;
          const y = t.clientY - offsetY;
          btn.style.left = (x + btn.offsetWidth/2) + "px";
          btn.style.top = (y + btn.offsetHeight/2) + "px";
          btn.style.transform = "translate(-50%, -50%)";
          const center = getBtnCenter();
          updateListenerFromScreen(center.x, center.y);
        }, { passive: false });

        window.addEventListener("touchend", (ev) => {
          if (!dragging) return;
          dragging = false;
          btn.style.cursor = "grab";
          const center = getBtnCenter();
          updateListenerFromScreen(center.x, center.y);
          try {
            if (!window.activeSpawn || !window.activeSpawn.screenPos) {
              console.warn("No activeSpawn available on touchend");
            } else {
              const dx = center.x - window.activeSpawn.screenPos.clientX;
              const dy = center.y - window.activeSpawn.screenPos.clientY;
              const pixelDist = Math.sqrt(dx*dx + dy*dy);
              console.log("touchend pixel dist to activeSpawn:", pixelDist);
              if (pixelDist <= DROP_PIXEL_THRESHOLD) {
                try { if (window.activeSpawn && window.activeSpawn.instance && typeof window.activeSpawn.instance.stop === "function") window.activeSpawn.instance.stop(FMOD.STOP_ALLOWFADEOUT); } catch(e){}
                try { if (typeof playCryFound === "function") playCryFound(); } catch(e){}
                window.activeSpawn = null;
                window.resolvedMonsters = (window.resolvedMonsters || 0) + 1;
                console.log("resolvedMonsters ->", window.resolvedMonsters);
                if ((window.resolvedMonsters || 0) >= (typeof totalMonsters !== "undefined" ? totalMonsters : 4)) {
                  try {
                    if (header) { header.style.transition = "opacity 800ms ease"; header.style.opacity = "0"; }
                    if (btn) { btn.style.transition = "opacity 800ms ease, transform 800ms ease"; btn.style.opacity = "0"; btn.style.transform = "translate(-50%, -40%) scale(0.98)"; }
                  } catch(e){}
                  setTimeout(() => {
                    try { if (header && header.parentNode) header.parentNode.removeChild(header); } catch(e){}
                    try { if (btn && btn.parentNode) btn.parentNode.removeChild(btn); } catch(e){}
                  }, 900);
                  try {
                    const inst = (typeof window.safeCreateAndStart === "function") ? window.safeCreateAndStart("event:/cabindialogue2") : null;
                    if (inst && typeof inst.setCallback === "function") {
                      inst.setCallback((eventType) => {
                        if (eventType === window.FMOD.STUDIO_EVENT_CALLBACK_STOPPED) {
                          try { rampInoutToZero(2000); } catch(e){}
                          setTimeout(() => { try { if (typeof window.createActionButtons === "function") window.createActionButtons(); } catch(e){} }, 300);
                          setTimeout(() => {
                            try {
                              if (typeof window.startCreatureEvent === "function") {
                                const inst = window.startCreatureEvent();
                                if (!inst) {
                                  setTimeout(() => { if (window._lastCreatureInstance) attachCreatureStopHandler(window._lastCreatureInstance); }, 300);
                                }
                              }
                            } catch(e){}
                          }, 900);
                        }
                      }, window.FMOD.STUDIO_EVENT_CALLBACK_STOPPED);
                    } else {
                      rampInoutToZero(2000);
                      setTimeout(() => { try { if (typeof window.createActionButtons === "function") window.createActionButtons(); } catch(e){} }, 300);
                      setTimeout(() => {
                        try {
                          if (typeof window.startCreatureEvent === "function") {
                            const inst = window.startCreatureEvent();
                            if (!inst) {
                              setTimeout(() => { if (window._lastCreatureInstance) attachCreatureStopHandler(window._lastCreatureInstance); }, 300);
                            }
                          }
                        } catch(e){}
                      }, 900);
                    }
                  } catch(e){ console.warn("play cabindialogue2 failed", e); }
                  return;
                }
                try { if (typeof window.spawnSingleMonsterRandom === "function") window.spawnSingleMonsterRandom(60); } catch(e){}
              } else {
                console.log("touchend too far (>threshold), no action");
              }
            }
          } catch(e){ console.warn("touchend handling failed", e); }
        }, { passive: false });

        // click fallback
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          if (dragging) return;
          const center = getBtnCenter();
          try {
            if (!window.activeSpawn || !window.activeSpawn.screenPos) {
              console.debug("No activeSpawn available on click (ignored)");
            } else {
              const dx = center.x - window.activeSpawn.screenPos.clientX;
              const dy = center.y - window.activeSpawn.screenPos.clientY;
              const pixelDist = Math.sqrt(dx*dx + dy*dy);
              if (pixelDist <= DROP_PIXEL_THRESHOLD) {
                try { if (window.activeSpawn && window.activeSpawn.instance && typeof window.activeSpawn.instance.stop === "function") window.activeSpawn.instance.stop(FMOD.STOP_ALLOWFADEOUT); } catch(e){}
                try { if (typeof playCryFound === "function") playCryFound(); } catch(e){}
                window.activeSpawn = null;
                window.resolvedMonsters = (window.resolvedMonsters || 0) + 1;
                console.log("resolvedMonsters ->", window.resolvedMonsters);
                if ((window.resolvedMonsters || 0) >= (typeof totalMonsters !== "undefined" ? totalMonsters : 4)) {
                  try {
                    if (header) { header.style.transition = "opacity 800ms ease"; header.style.opacity = "0"; }
                    if (btn) { btn.style.transition = "opacity 800ms ease, transform 800ms ease"; btn.style.opacity = "0"; btn.style.transform = "translate(-50%, -40%) scale(0.98)"; }
                  } catch(e){}
                  setTimeout(() => {
                    try { if (header && header.parentNode) header.parentNode.removeChild(header); } catch(e){}
                    try { if (btn && btn.parentNode) btn.parentNode.removeChild(btn); } catch(e){}
                  }, 900);
                  try {
                    const inst = (typeof window.safeCreateAndStart === "function") ? window.safeCreateAndStart("event:/cabindialogue2") : null;
                    if (inst && typeof inst.setCallback === "function") {
                      inst.setCallback((eventType) => {
                        if (eventType === window.FMOD.STUDIO_EVENT_CALLBACK_STOPPED) {
                          try { rampInoutToZero(2000); } catch(e){}
                          setTimeout(() => { try { if (typeof window.createActionButtons === "function") window.createActionButtons(); } catch(e){} }, 300);
                          setTimeout(() => {
                            try {
                              if (typeof window.startCreatureEvent === "function") {
                                const inst = window.startCreatureEvent();
                                if (!inst) {
                                  setTimeout(() => { if (window._lastCreatureInstance) attachCreatureStopHandler(window._lastCreatureInstance); }, 300);
                                }
                              }
                            } catch(e){}
                          }, 900);
                        }
                      }, window.FMOD.STUDIO_EVENT_CALLBACK_STOPPED);
                    } else {
                      rampInoutToZero(2000);
                      setTimeout(() => { try { if (typeof window.createActionButtons === "function") window.createActionButtons(); } catch(e){} }, 300);
                      setTimeout(() => {
                        try {
                          if (typeof window.startCreatureEvent === "function") {
                            const inst = window.startCreatureEvent();
                            if (!inst) {
                              setTimeout(() => { if (window._lastCreatureInstance) attachCreatureStopHandler(window._lastCreatureInstance); }, 300);
                            }
                          }
                        } catch(e){}
                      }, 900);
                    }
                  } catch(e){ console.warn("play cabindialogue2 failed", e); }
                  return;
                }
                try { if (typeof window.spawnSingleMonsterRandom === "function") window.spawnSingleMonsterRandom(60); } catch(e){}
              } else {
                console.log("click too far (>threshold), no action");
              }
            }
          } catch(e){ console.warn("click handling failed", e); }
        });

      } catch (e) {
        console.warn("showDragMonsterButton error", e);
      }
    }; // end showDragMonsterButton

  }); // end window.load
})(); // end IIFE
