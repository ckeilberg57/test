var video;
var bandwidth;
var conference;
var pin;
var rtc = null;

/* ~~~ SETUP AND TEARDOWN ~~~ */

function finalise(event) {
  rtc.disconnect();
  video.src = "";
}

function remoteDisconnect(reason) {
  window.removeEventListener("beforeunload", finalise);
  document.getElementById("controls").style.display = "none";
  console.log("Disconnected: " + reason);
}

function doneSetup(videoURL, pin_status) {
  console.log("PIN status: " + pin_status);
  rtc.connect(pin);
}

function connected(videoURL) {
  video.poster = "";
  video.style.display = "block";

  if (typeof MediaStream !== "undefined" && videoURL instanceof MediaStream) {
    video.srcObject = videoURL;
  } else {
    video.src = videoURL;
  }

  document.getElementById("controls").style.display = "block";
}

function feccHandler(signal) {
  console.log("WHAT THE FECC YO");
  onFecc(signal);
}

function handleApplicationMessage(message) {
  handleFeecMessage(message, rtc);
}

function initialise(
  node,
  conference,
  userbw,
  name,
  userpin,
  registration_token,
  oneTimeToken
) {
  video = document.getElementById("video");
  console.log("Bandwidth: " + userbw);
  console.log("Conference: " + conference);

  pin = userpin;
  bandwidth = parseInt(userbw);

  rtc = new PexRTC();
  rtc.registration_token = registration_token;
  rtc.oneTimeToken = oneTimeToken;
  rtc.fecc_supported = true;
  rtc.video_source = videoSelect.value;
  window.addEventListener("beforeunload", finalise);

  rtc.onSetup = doneSetup;
  rtc.onConnect = connected;
  rtc.onError = remoteDisconnect;
  rtc.onFECC = feccHandler;
  rtc.onApplicationMessage = handleApplicationMessage;
  rtc.makeCall(node, conference, name, bandwidth);
}

function endCall() {
  console.log("User wants to end the call.");
  rtc.disconnect();
  video = document.querySelector("video#video.mediastream");
  video.style.display = "none";
  document.getElementById("controls").style.display = "none";
}

try {
  const stream = navigator.mediaDevices.getUserMedia({
    video: { pan: true, tilt: true, zoom: true }
  });
} catch (error) {
  console.log(error);
}

const panTiltZoomPermissionStatus = navigator.permissions.query({
  name: "camera",
  panTiltZoom: true
});

function onFecc(fecc) {
  console.info("FECC action", fecc);
  if (fecc.action === "stop") return;

  const [videoTrack] = stream.getVideoTracks();
  const capabilities = videoTrack.getCapabilities();
  const settings = videoTrack.getSettings();

  console.log("Camera capabilities:", capabilities);

  if (!this.actionsSettings) {
    this.actionsSettings = {
      pan: settings.pan || 0,
      tilt: settings.tilt || 0,
      zoom: settings.zoom || 0
    };
  }

  const panTiltDelta = 150000;
  const zoomDelta = 10;

  fecc.movement.forEach(({ axis, direction }) => {
    const cap = capabilities[axis];
    if (!cap) return;

    const constraints = { advanced: [] };

    if (axis === "pan") {
      let pan = this.actionsSettings.pan + (direction === "left" ? -panTiltDelta : panTiltDelta);
      pan = Math.min(Math.max(pan, cap.min), cap.max);
      this.actionsSettings.pan = pan;
      constraints.advanced.push({ pan });
    }

    if (axis === "tilt") {
      let tilt = this.actionsSettings.tilt + (direction === "down" ? -panTiltDelta : panTiltDelta);
      tilt = Math.min(Math.max(tilt, cap.min), cap.max);
      this.actionsSettings.tilt = tilt;
      constraints.advanced.push({ tilt });
    }

    if (axis === "zoom") {
      let zoom = this.actionsSettings.zoom + (direction === "out" ? -zoomDelta : zoomDelta);
      zoom = Math.min(Math.max(zoom, cap.min), cap.max);
      this.actionsSettings.zoom = zoom;
      constraints.advanced.push({ zoom });
    }

    console.info("Applying constraints:", constraints);
    videoTrack.applyConstraints(constraints).catch(err => {
      console.error(`Failed to apply ${axis} constraints:`, err);
    });
  });
}

let isVideoMuted = false;
function muteVideoStreams() {
  isVideoMuted = !isVideoMuted;
  rtc.muteVideo(isVideoMuted);

  const muteVideoBtn = document.getElementById("id_mutevideo");
  const icon = muteVideoBtn.querySelector("i");
  if (isVideoMuted) {
    muteVideoBtn.style.backgroundColor = "red";
    muteVideoBtn.style.color = "white";
    icon.classList.remove("fa-video");
    icon.classList.add("fa-video-slash");
  } else {
    muteVideoBtn.style.backgroundColor = "#D6D6D6";
    muteVideoBtn.style.color = "#5244EE";
    icon.classList.remove("fa-video-slash");
    icon.classList.add("fa-video");
  }
}

let isAudioMuted = false;
function muteAudioStreams() {
  isAudioMuted = !isAudioMuted;
  rtc.muteAudio(isAudioMuted);

  const muteAudioBtn = document.getElementById("id_muteaudio");
  const icon = muteAudioBtn.querySelector("i");
  if (isAudioMuted) {
    muteAudioBtn.style.backgroundColor = "red";
    muteAudioBtn.style.color = "white";
    icon.classList.remove("fa-microphone");
    icon.classList.add("fa-microphone-slash");
  } else {
    muteAudioBtn.style.backgroundColor = "#D6D6D6";
    muteAudioBtn.style.color = "#5244EE";
    icon.classList.remove("fa-microphone-slash");
    icon.classList.add("fa-microphone");
  }
}

var reg = {
  token: null,
  event_source: null,
  token_refresh: null,
  node: null,
  alias: null,

  register: function () {
    var alias = document.getElementById("reg_alias").value;
    var host = document.getElementById("reg_host").value;
    this.node = host;
    this.alias = alias;

    if (this.request_token()) {
      if (this.start_events()) {
        var regunreg = document.getElementById("register");
        regunreg.value = "Unregister";
        regunreg.className = "red";
        regunreg.onclick = reg.unregister.bind(this);

        console.log("Registered " + this);

        var statusEl = document.getElementById("reg_status");
        statusEl.innerText = "REGISTERED";
        statusEl.classList.remove("flashing-red", "red");
        statusEl.classList.add("green");

        var refreshBtn = document.getElementById("refresh_registration_btn");
        if (refreshBtn) {
          refreshBtn.style.display = "none";
        }

      } else {
        this.release_token();
      }
    }
  },

  unregister: function () {
    if (this.event_source) {
      this.event_source.close();
      this.event_source = null;
    }

    if (this.token_refresh) {
      clearInterval(this.token_refresh);
      this.token_refresh = null;
    }

    this.release_token();

    var regunreg = document.getElementById("register");
    regunreg.value = "Register Endpoint";
    regunreg.className = "green";
    regunreg.onclick = reg.register.bind(this);

    const regStatus = document.getElementById("reg_status");
    regStatus.innerText = "UNREGISTERED!!";
    regStatus.classList.add("flashing-red");

    var refreshBtn = document.getElementById("refresh_registration_btn");
    if (!refreshBtn) {
      refreshBtn = document.createElement("button");
      refreshBtn.id = "refresh_registration_btn";
      refreshBtn.innerText = "Refresh Registration";
      refreshBtn.onclick = function () {
        location.reload();
      };
      document.body.appendChild(refreshBtn);
    }
    refreshBtn.style.display = "inline-block";
  },

  request_token: function () {
    var username = document.getElementById("reg_username").value;
    var password = document.getElementById("reg_password").value;
    var response = this.post_request("request_token", null, username, password);
    var reg_error = document.getElementById("regerror");
    reg_error.innerHTML = "";

    if (response["status"] == 200) {
      this.token = response["data"]["result"]["token"];
      this.registration_uuid = response["data"]["result"]["registration_uuid"];
      var expires = response["data"]["result"]["expires"] || 120;
      this.token_refresh = setInterval(this.refresh_token.bind(this), (expires * 1000) / 2);
      return true;
    } else {
      reg_error.innerHTML = "Failed to register: " + response["status"];
      reg_error.classList.add("flashing-red");
    }

    return false;
  },

  refresh_token: function () {
    var response = this.post_request("refresh_token", null, this.token);
    console.log("Refreshed token.");
  },

  post_request: function (type, params, username, password) {
    // Placeholder: replace with your actual AJAX logic
    return { status: 200, data: { result: { token: "abc", registration_uuid: "xyz" } } };
  },

  start_events: function () {
    // Placeholder for SSE or WebSocket setup
    return true;
  },

  release_token: function () {
    // Placeholder for token release logic
    this.token = null;
  }
};

// === ADDED FOR IP CHANGE DETECTION ===
let currentIP = null;

async function checkIPChangeAndReregister() {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();
    const newIP = data.ip;

    if (currentIP && currentIP !== newIP) {
      console.log(`IP address changed from ${currentIP} to ${newIP}. Re-registering...`);
      reg.unregister();
      setTimeout(() => {
        reg.register();
      }, 1000); // Delay to allow cleanup
    }

    currentIP = newIP;
  } catch (error) {
    console.error("Failed to check IP address:", error);
  }
}

// Check every 30 seconds
setInterval(checkIPChangeAndReregister, 30000);
// Run initially
checkIPChangeAndReregister();
// === END IP CHANGE DETECTION ===
