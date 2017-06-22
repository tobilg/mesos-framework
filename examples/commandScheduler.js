"use strict";

var lib = require("requirefrom")("lib");

var Scheduler = lib("scheduler");
var Builder = lib("builder");

var scheduler = new Scheduler({
    "masterUrl": "172.17.11.102", // If Mesos DNS is used this would be "leader.mesos", otherwise use the actual IP address of the leading master
    "port": 5050,
    "frameworkName": "My first Command framework",
    "logging": {
        "level": "debug" // Set log Level to debug (default is info)
    },
    "restartStates": ["TASK_FAILED", "TASK_KILLED", "TASK_LOST", "TASK_ERROR", "TASK_FINISHED"], // Overwrite the restartStates (by default, TASK_FINISHED tasks are NOT restarted!)
    "tasks": {
        "sleepProcesses": {
            "priority": 1,
            "instances": 3,
            "commandInfo": new Builder("mesos.CommandInfo").setValue("env && sleep 100").setShell(true),
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
    }, 60000);

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
    scheduler.logger.error("ERROR: " + (error.message ? error.message : JSON.stringify(error)));
    if (error.stack) {
        scheduler.logger.error(error.stack);
    }
});

scheduler.on("ready", function () {
    // Start framework scheduler
    scheduler.subscribe();
});
