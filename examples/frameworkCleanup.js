"use strict";

var Scheduler = require("../index").Scheduler;
var Mesos = require("../index").Mesos.getMesos();

var scheduler = new Scheduler({
    "masterUrl": process.env.MESOS_MASTER_IP,
    "port": 5050,
    "frameworkId": process.env.FRAMEWORK_ID,
    "frameworkName": process.env.FRAMEWORK_NAME,
    "role": process.env.FRAMEWORK_ROLE,
    "principal": process.env.FRAMEWORK_PRINCIPAL,
    "logging": {
        "level": "debug" // Set log Level to debug (default is info)
    },
    "tasks": {},
    "handlers": {}
});

// Start the main logic once the framework scheduler has received the "SUBSCRIBED" event from the leading Mesos master
scheduler.on("subscribed", function (obj) {

    // Display the Mesos-Stream-Id
    scheduler.logger.info("Mesos Stream Id is " + obj.mesosStreamId);

    // Display the framework id
    scheduler.logger.info("Framework Id is " + obj.frameworkId);

    // Check if there are task running
    scheduler.reconcile();

    // Trigger shutdown after one minute
    setTimeout(function() {
        // Send "TEARDOWN" request
        scheduler.teardown();
        // Shutdown process
        process.exit(0);
    }, 15000);

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

scheduler.on("update", function (updateObj) {
    scheduler.logger.info(JSON.stringify(updateObj));

    // If the update's reason is REASON_RECONCILIATION then we know that we triggered it -> Shutdown all executors
    if (updateObj.status.reason === "REASON_RECONCILIATION") {
        process.nextTick(function() {
            scheduler.shutdown(updateObj.status.agent_id.value, updateObj.status.executor_id.value);
        });
    }
    
});