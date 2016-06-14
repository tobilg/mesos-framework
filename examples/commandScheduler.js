"use strict";

var Scheduler = require("../index").Scheduler;
var Mesos = require("../index").Mesos().getMesos();

var scheduler = new Scheduler({
    "masterUrl": "172.17.10.103",
    "port": 5050,
    "frameworkName": "My first Command framework",
    "commandInfo": new Mesos.CommandInfo(
        null, // URI
        null, // Environment
        true, // Is shell?
        "sleep 10;", // Command
        null, // Arguments
        null // User
    ),
    "resources": [ // Define your needed resources here
        new Mesos.Resource("cpus", Mesos.Value.Type.SCALAR, new Mesos.Value.Scalar(0.1)),
        new Mesos.Resource("mem", Mesos.Value.Type.SCALAR, new Mesos.Value.Scalar(64))
    ],
    "instances": 1,
    "handlers": {
        "HEARTBEAT": function (timestamp) {
            console.log("CUSTOM HEARTBEAT!");
            this.lastHeartbeat = timestamp;
        }
    }
});

// Start the main logic once the framework scheduler has received the "SUBSCRIBED" event from the leading Mesos master
scheduler.on("subscribed", function (obj) {

    // Display the Mesos-Stream-Id
    console.log("Mesos Stream Id is " + obj.mesosStreamId);

    // Display the framework id
    console.log("Framework Id is " + obj.frameworkId);

    // Trigger shutdown after one minute
    setTimeout(function() {
        // Send "TEARDOWN" request
        scheduler.teardown();
        // Shutdown process
        process.exit(0);
    }, 60000);

});

// Capture "offers" events
scheduler.on("offers", function (offers) {
    console.log("Got offers: " + JSON.stringify(offers));
});

// Capture "heartbeat" events
scheduler.on("heartbeat", function (heartbeatTimestamp) {
    console.log("Heartbeat on " + heartbeatTimestamp);
});

// Capture "error" events
scheduler.on("error", function (error) {
    console.log("ERROR: " + JSON.stringify(error));
    console.log(error.stack);
});

// Start framework scheduler
scheduler.subscribe();
