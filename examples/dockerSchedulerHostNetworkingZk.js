"use strict";

var Scheduler = require("../index").Scheduler;
var Mesos = require("../index").Mesos.getMesos();
var Builder = require("../index").Builder;

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
    "masterUrl": "172.17.11.101", // If Mesos DNS is used this would be "leader.mesos", otherwise use the actual IP address of the leading master
    "port": 5050,
    "frameworkName": "My first Docker framework (host networking)1",
    "logging": {
        "path": "logs",
        "fileName": "mesos-framework-docker-host.log",
        "level": "debug"
    },
    "useZk": true,
    "zkUrl": "172.17.11.101:2181",
    "tasks": {
        "webservers": {
            "priority": 1,
            "instances": 1,
            "executorInfo": null, // Can take a Mesos.ExecutorInfo object
            "containerInfo": ContainerInfo, // Mesos.ContainerInfo object
            "commandInfo": new Mesos.CommandInfo( // Strangely, this is needed, even when specifying ContainerInfo...
                null, // URI
                new Mesos.Environment([
                    new Builder("mesos.Environment.Variable").setName("FOO").setValue("BAR")
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
            "healthChecks": [
                //new Mesos.HealthCheck(new Mesos.HealthCheck.HTTP(8080, "/health", [200]), 10.0, 20.0, 3)
            ], // Add your health checks here
            "labels": null // Add your labels (an array of { "key": "value" } objects)
        }
    },
    "handlers": {
        "HEARTBEAT": function (timestamp) {
            this.logger.info("CUSTOM HEARTBEAT!");
            this.lastHeartbeat = timestamp;
        }
    }
});

// Start the main logic once the framework scheduler has received the "SUBSCRIBED" event from the leading Mesos master
scheduler.on("subscribed", function (obj) {

    // Display the Mesos-Stream-Id
    scheduler.logger.info("Mesos Stream Id is " + obj.mesosStreamId);

    // Display the framework id
    scheduler.logger.info("Framework Id is " + obj.frameworkId);

    // Trigger shutdown after one minute
    setTimeout(function() {
        // Send "TEARDOWN" request
        scheduler.teardown();
        // Shutdown process
        process.exit(0);
    }, 600000);

});

// Capture "offers" events
scheduler.on("offers", function (offers) {
    scheduler.logger.info("Got offers: " + JSON.stringify(offers));
});

// Capture "heartbeat" events
scheduler.on("heartbeat", function (heartbeatTimestamp) {
    scheduler.logger.info("Heartbeat on " + heartbeatTimestamp);
});

// Capture "error" events
scheduler.on("error", function (error) {
    scheduler.logger.info("ERROR: " + JSON.stringify(error));
    scheduler.logger.info(error.stack);
});

scheduler.on("ready", function () {
    // Start framework scheduler
    scheduler.subscribe();
});
