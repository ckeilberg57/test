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
  //cleanup(); 
  //alert(reason);
  window.removeEventListener("beforeunload", finalise);
  //window.close();

  // Hide the footer when disconnected
  document.getElementById("controls").style.display = "none"; // Hide the footer
  
  // Optionally, you can log the reason for disconnection
  console.log("Disconnected: " + reason);
}

function doneSetup(videoURL, pin_status) {
  console.log("PIN status: " + pin_status);
  rtc.connect(pin);
}

function connected(videoURL) {
  video.poster = "";

  // Make sure the video element is visible again
  video.style.display = "block"; // Show the video element
  
  if (typeof MediaStream !== "undefined" && videoURL instanceof MediaStream) {
    video.srcObject = videoURL;
  } else {
    video.src = videoURL;
  }
  // Show the footer controls when connected
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
  //rtc.onDisconnect = remoteDisconnect;
  rtc.onFECC = feccHandler;
  rtc.onApplicationMessage = handleApplicationMessage;
  rtc.makeCall(node, conference, name, bandwidth);
}

//try {
  //const stream = navigator.mediaDevices.getUserMedia({
    //video: { pan: true, tilt: true, zoom: true },
  //});
//} catch (error) {
  //console.log(error);
//}


function endCall() {
  console.log("User wants to end the call.");
  rtc.disconnect();
  video = document.querySelector('video#video.mediastream');
  // video.srcObject = "";
  video.style.display="none";
  // Hide the footer controls
  document.getElementById("controls").style.display = "none"; // Hide the footer
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
        // Registered
        // Toggle register/unregister button
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
    // TODO better dialog support, so we can close when call is cancelled
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

var remote_alias_autocomplete = new autoComplete({
  selector: "#remotealias",
  minChars: 1,
  source: function (term, suggest) {
    term = term.toLowerCase();
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.open(
      "GET",
      "https://" + user.node + "/api/client/v2/registrations?q=" + term,
      false
    );
    if (user.token) {
      xmlhttp.setRequestHeader("token", user.token);
    }
    var suggestions = [];
    try {
      xmlhttp.send();
      console.log("responseText " + xmlhttp.responseText);
      result = JSON.parse(xmlhttp.responseText)["result"];
      for (var i = 0; i < result.length; i++) {
        suggestions.push(result[i]["alias"]);
      }
    } catch (exception) {
      console.log("Exception during get_request");
    }
    suggest(suggestions);
  },
});
