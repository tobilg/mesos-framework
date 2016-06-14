"use strict";

var Scheduler = require("../index").Scheduler;
var Mesos = require("../index").Mesos().getMesos();

var ContainerInfo = new Mesos.ContainerInfo(
    Mesos.ContainerInfo.Type.DOCKER, // Type
    null, // Volumes
    null, // Hostname
    new Mesos.ContainerInfo.DockerInfo(
        "tobilg/mini-webserver", // Image
        Mesos.ContainerInfo.DockerInfo.Network.HOST, // Network
        null, // PortMappings
        false, // Privileged
        new Mesos.Parameter("env", "SERVER_PORT=8888") // Parameters
    )
);

var scheduler = new Scheduler({
    "masterUrl": "172.17.10.103",
    "port": 5050,
    "frameworkName": "My first Docker framework",
    "containerInfo": ContainerInfo,
    "commandInfo": new Mesos.CommandInfo( // Strangely, this is needed, even when specifying ContainerInfo...
        null, // URI
        null, // Environment
        false, // Is shell?
        null, // Command
        null, // Arguments
        null // User
    ),
    "resources": [ // Define your needed resources here
        new Mesos.Resource("cpus", Mesos.Value.Type.SCALAR, new Mesos.Value.Scalar(0.2)),
        new Mesos.Resource("mem", Mesos.Value.Type.SCALAR, new Mesos.Value.Scalar(128))
    ],
    "instances": 3,
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
