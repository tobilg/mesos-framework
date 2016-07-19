"use strict";

var Scheduler = require("../index").Scheduler;
var Mesos = require("../index").Mesos.getMesos();

var ContainerInfo = new Mesos.ContainerInfo(
    Mesos.ContainerInfo.Type.DOCKER, // Type
    null, // Volumes
    null, // Hostname
    new Mesos.ContainerInfo.DockerInfo(
        "tobilg/mini-webserver", // Image
        Mesos.ContainerInfo.DockerInfo.Network.HOST, // Network
        null,  // PortMappings
        false, // Privileged
        null,  // Parameters
        false, // forcePullImage
        null   // Volume Driver
    )
);

var scheduler = new Scheduler({
    "masterUrl": "172.17.10.101",
    "port": 5050,
    "frameworkName": "My first Docker framework",
    "tasks": {
        "webservers": {
            "priority": 1,
            "instances": 3,
            "executorInfo": null, // Can take a Mesos.ExecutorInfo object
            "containerInfo": ContainerInfo, // Mesos.ContainerInfo object
            "commandInfo": new Mesos.CommandInfo( // Strangely, this is needed, even when specifying ContainerInfo...
                null, // URI
                new Mesos.Environment([
                    new Mesos.Environment.Variable("FOO", "BAR")
                ]), // Environment
                false, // Is shell?
                null, // Command
                null, // Arguments
                null // User
            ),
            "resources": {
                "cpus": 0.2,
                "mem": 128,
                "ports": 1,
                "disk": 0
            },
            "healthChecks": null, // Add your health checks here
            "labels": null // Add your labels (an array of { "key": "value" } objects)
        },
        "webservers1": {
            "priority": 2,
            "instances": 1,
            "executorInfo": null, // Can take a Mesos.ExecutorInfo object
            "containerInfo": ContainerInfo, // Mesos.ContainerInfo object
            "commandInfo": new Mesos.CommandInfo( // Strangely, this is needed, even when specifying ContainerInfo...
                null, // URI
                null, // Environment
                false, // Is shell?
                null, // Command
                null, // Arguments
                null // User
            ),
            "resources": {
                "cpus": 0.2,
                "mem": 256,
                "ports": 1,
                "disk": 0
            },
            "portMappings": [
                { "port": 80, "protocol": "tcp" }
            ],
            "healthChecks": null, // Add your health checks here
            "labels": null // Add your labels (an array of { "key": "value" } objects)
        }
    },
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
