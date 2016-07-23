"use strict";

var Scheduler = require("../index").Scheduler;
var Mesos = require("../index").Mesos.getMesos();

var scheduler = new Scheduler({
    "masterUrl": "172.17.10.101", // If Mesos DNS is not used, use the actual IP address of the leading master!
    "port": 5050,
    "frameworkName": "My first Command framework",
    "logging": {
        "level": "debug"
    },
    "restartStates": ["TASK_FAILED", "TASK_KILLED", "TASK_LOST", "TASK_ERROR", "TASK_FINISHED"],
    "tasks": {
        "webservers": {
            "priority": 1,
            "instances": 3,
            "commandInfo": new Mesos.CommandInfo(
                null, // URI
                null, // Environment
                true, // Is shell?
                "sleep 10;", // Command
                null, // Arguments
                null // User
            ),
            "resources": {
                "cpus": 0.2,
                "mem": 128,
                "ports": 1,
                "disk": 0
            }
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

// Start framework scheduler
scheduler.subscribe();
