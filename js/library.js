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
  
  document.getElementById("controls").style.display = "block"; // Show the footer
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
  //console.log('LOOK HERE', videoSelect.value);
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
  video = document.querySelector('video#video.mediastream');
  video.style.display="none";
  document.getElementById("controls").style.display = "none"; 
}

try {
  const stream = navigator.mediaDevices.getUserMedia({
    video: { pan: true, tilt: true, zoom: true }
  });

} catch (error) {
  console.log(error);
}

const panTiltZoomPermissionStatus = navigator.permissions.query({ name: "camera", panTiltZoom: true });

function onFecc(fecc) {
  console.info('FECC action', fecc);
  if (fecc.action === 'stop') return;

  const [videoTrack] = stream.getVideoTracks();
  const capabilities = videoTrack.getCapabilities();
  const settings = videoTrack.getSettings();

  console.log('Camera capabilities:', capabilities);
  console.log('Pan capabilities:', capabilities.pan);
  console.log('Tilt capabilities:', capabilities.tilt);
  console.log('Zoom capabilities:', capabilities.zoom);

  if (!this.actionsSettings) {
    this.actionsSettings = {
      pan: settings.pan || 0,
      tilt: settings.tilt || 0,
      zoom: settings.zoom || capabilities.zoom.min || 100
    };
  }

  // 🔧 Reduce pan/tilt step for finer control
  const panTiltDelta = 150000;
  const zoomDelta = capabilities.zoom?.step || 10;

  fecc.movement.forEach(({ axis, direction }) => {
    const cap = capabilities[axis];
    if (!cap) return;

    const constraints = { advanced: [] };

    if (axis === 'pan') {
      let pan = this.actionsSettings.pan + (direction === 'left' ? -panTiltDelta : panTiltDelta);
      pan = Math.min(Math.max(pan, cap.min), cap.max);
      this.actionsSettings.pan = pan;
      constraints.advanced.push({ pan });
    }

    if (axis === 'tilt') {
      let tilt = this.actionsSettings.tilt + (direction === 'down' ? -panTiltDelta : panTiltDelta);
      tilt = Math.min(Math.max(tilt, cap.min), cap.max);
      this.actionsSettings.tilt = tilt;
      constraints.advanced.push({ tilt });
    }

    let zoomInterval = null;
    const zoomStepInterval = 100; // milliseconds between zoom steps

    if (axis === 'zoom') {
      if (fecc.action === 'start') {
        let zoom = this.actionsSettings.zoom + (direction === 'out' ? -zoomDelta : zoomDelta);
        zoom = Math.min(Math.max(zoom, cap.min), cap.max);
        this.actionsSettings.zoom = zoom;
        console.log(Zoom updated to: ${zoom});
        constraints.advanced.push({ zoom });
      }
    }
    
    console.info('Applying constraints:', constraints);
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
  console.log(`Video is now ${isVideoMuted ? "muted" : "unmuted"}.`);
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
  console.log(`Audio is now ${isAudioMuted ? "muted" : "unmuted"}.`);
}

var reg = {
  token: null,
  event_source: null,
  token_refresh: null,

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
    console.log("Unregister " + this);

    if (this.token_refresh) {
      clearInterval(this.token_refresh);
      this.token_refresh = null;
    }

    this.release_token();

    var regunreg = document.getElementById("register");
    regunreg.value = "Register Endpoint";
    regunreg.className = "green";
    regunreg.onclick = reg.register.bind(this);
  },

  request_token: function () {
    var username = document.getElementById("reg_username").value;
    var password = document.getElementById("reg_password").value;
    var response = this.post_request("request_token", null, username, password);
    var reg_error = document.getElementById("regerror");
    reg_error.innerHTML = "";
    console.log("response " + response["status"]);
    if (response["status"] == 200) {
      this.token = response["data"]["result"]["token"];
      this.registration_uuid = response["data"]["result"]["registration_uuid"];
      var expires = response["data"]["result"]["expires"];
      if (expires === undefined) {
        expires = 120;
      }
      this.token_refresh = setInterval(
        this.refresh_token.bind(this),
        (expires * 1000) / 2
      );
      return true;
    } else if (response["status"] == 401) {
      reg_error.innerHTML = "Current Status: UNREGISTERED!!";
    } else if (response["status"] == 0) {
      reg_error.innerHTML =
        "Failed to register: " + JSON.stringify(response["data"]);
    } else {
      reg_error.innerHTML =
        "Failed to register: " +
        response["status"] +
        "(" +
        JSON.stringify(response["data"]) +
        ")";
    }
    return false;
  },

  refresh_token: function () {
    console.log("refresh_token this " + this);
    var response = this.post_request("refresh_token", null);
    console.log("response " + response["status"]);
    if (response["status"] == 200) {
      this.token = response["data"]["result"]["token"];
    } else {
      console.log("Refresh failed, unregister");
      this.unregister();
      alert("Token refresh failed");
    }
    return false;
  },

  release_token: function () {
    if (this.token) {
      this.post_request("release_token", null);
      this.token = null;
    }
  },

  start_events: function () {
    this.event_source = new EventSource(
      "https://" +
        this.node +
        "/api/client/v2/registrations/" +
        this.alias +
        "/events?token=" +
        this.token
    );
    this.event_source.addEventListener(
      "incoming",
      reg.incoming.bind(this),
      false
    );
    this.event_source.addEventListener(
      "incoming_cancelled",
      reg.incoming_cancelled.bind(this),
      false
    );
    return true;
  },

  //Same info as previous section, but with an auto-confirm
  incoming: function (event) {
    incoming_data = JSON.parse(event.data);
    console.log("incoming");
    document.getElementById("conference").value =
      incoming_data["conference_alias"];
    document.getElementById("worker").value = this.node;
    document.getElementById("pin").value = "";
    initialise(
      this.node,
      incoming_data["conference_alias"],
      undefined,
      "carekiosk@ck-collab-engtest.com",
      undefined,
      reg.token,
      incoming_data["token"]
    );
  },

  incoming_cancelled: function (event) {
    incoming_data = JSON.parse(event.data);
    console.log("incoming cancelled");
  },

  release_incoming_token: function (token, conference) {
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.open(
      "POST",
      "https://" +
        this.node +
        "/api/client/v2/conferences/" +
        conference +
        "/release_token",
      false
    );
    if (token) {
      xmlhttp.setRequestHeader("token", token);
    }
    try {
      xmlhttp.send();
      console.log("responseText " + xmlhttp.responseText);
      return { status: xmlhttp.status, data: JSON.parse(xmlhttp.responseText) };
    } catch (exception) {
      console.log("Exception during post_request");
      return { status: xmlhttp.status, data: {} };
    }
  },

  post_request: function (command, data, username, password) {
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.open(
      "POST",
      "https://" +
        this.node +
        "/api/client/v2/registrations/" +
        this.alias +
        "/" +
        command,
      false
    );
    if (this.token) {
      xmlhttp.setRequestHeader("token", this.token);
    }
    var enc = window.btoa(username + ":" + password);
    xmlhttp.setRequestHeader("Authorization", "x-pexip-basic " + enc);
    try {
      if (data) {
        xmlhttp.setRequestHeader("Content-Type", "application/json");
        xmlhttp.send(JSON.stringify(data));
      } else {
        xmlhttp.send();
      }
      console.log("responseText " + xmlhttp.responseText);
      return { status: xmlhttp.status, data: JSON.parse(xmlhttp.responseText) };
    } catch (exception) {
      console.log("Exception during post_request");
      return { status: xmlhttp.status, data: {} };
    }
  },

  get_request: function (command) {
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.open(
      "GET",
      "https://" +
        this.node +
        "/api/client/v2/registrations/" +
        this.alias +
        "/" +
        command,
      false
    );
    if (this.token) {
      xmlhttp.setRequestHeader("token", this.token);
    }
    try {
      xmlhttp.send();
      console.log("responseText " + xmlhttp.responseText);
      return { status: xmlhttp.status, data: JSON.parse(xmlhttp.responseText) };
    } catch (exception) {
      console.log("Exception during get_request");
      return { status: xmlhttp.status, data: {} };
    }
  },
};
