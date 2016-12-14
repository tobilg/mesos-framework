"use strict";

var Scheduler = require("../index").Scheduler;
var Mesos = require("../index").Mesos.getMesos();
require("require-environment-variables")(["HOST", "PORT0", "PORT1"]);

var ContainerInfo = new Mesos.ContainerInfo(
    Mesos.ContainerInfo.Type.DOCKER, // Type
    null, // Volumes
    null, // Hostname
    new Mesos.ContainerInfo.DockerInfo(
        "vault", // "tobilg/mini-webserver", // Image
        Mesos.ContainerInfo.DockerInfo.Network.HOST, // Network
        null,  // PortMappings
        false, // Privileged
        null,  // Parameters
        false, // forcePullImage
        null   // Volume Driver
    )
);

var scheduler = new Scheduler({
    "masterUrl": "192.168.99.100", // If Mesos DNS is used this would be "leader.mesos", otherwise use the actual IP address of the leading master
    "port": 5050,
    "frameworkName": "Vault-fw",
    "logging": {
        "path": "logs",
        "fileName": "mesos-framework-docker-host.log",
        "level": "debug"
    },
    "tasks": {
        "webservers": {
            "priority": 1,
            "instances": 1,
            "executorInfo": null, // Can take a Mesos.ExecutorInfo object
            "containerInfo": ContainerInfo, // Mesos.ContainerInfo object
            "commandInfo": new Mesos.CommandInfo( // Strangely, this is needed, even when specifying ContainerInfo...
                null, // URI
                new Mesos.Environment([
                    new Mesos.Environment.Variable("FOO", "BAR"),
                    new Mesos.Environment.Variable("VAULT_LOCAL_CONFIG", "{\"default_lease_ttl\": \"168h\", \"max_lease_ttl\": \"720h\", \"listener\": {\"tcp\":{\"address\": \"0.0.0.0:8200\", \"tls_disable\": 1}}") // Arguments
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
            "portMappings": [
                { "port": 0, "protocol": "tcp" }
            ],
            "healthChecks": null, // Add your health checks here
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
