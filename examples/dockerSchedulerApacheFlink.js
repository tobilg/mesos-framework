"use strict";

var Scheduler = require("../index").Scheduler;
var Mesos = require("../index").Mesos.getMesos();

var ContainerInfo = new Mesos.ContainerInfo(
    Mesos.ContainerInfo.Type.DOCKER, // Type
    null, // Volumes
    null, // Hostname
    new Mesos.ContainerInfo.DockerInfo(
        "mesoshq/flink:0.1.1", // Image
        Mesos.ContainerInfo.DockerInfo.Network.HOST, // Network
        null,  // PortMappings
        false, // Privileged
        null,  // Parameters
        true, // forcePullImage
        null   // Volume Driver
    )
);

var scheduler = new Scheduler({
    "masterUrl": "172.17.10.101", // If Mesos DNS is used this would be "leader.mesos", otherwise use the actual IP address of the leading master
    "port": 5050,
    "frameworkName": "Simple Apache Flink HA framework",
    "logging": {
        "path": "logs",
        "fileName": "mesos-framework-flink.log",
        "level": "debug"
    },
    "tasks": {
        "jobmanagers": {
            "priority": 1,
            "instances": 3,
            "executorInfo": null, // Can take a Mesos.ExecutorInfo object
            "containerInfo": ContainerInfo, // Mesos.ContainerInfo object
            "commandInfo": new Mesos.CommandInfo( // Strangely, this is needed, even when specifying ContainerInfo...
                null, // URI
                new Mesos.Environment([
                    new Mesos.Environment.Variable("flink_recovery_mode", "zookeeper"),
                    new Mesos.Environment.Variable("flink_recovery_zookeeper_quorum", "172.17.10.101:2181"),
                    new Mesos.Environment.Variable("flink_recovery_zookeeper_storageDir", "/data/zk")
                ]), // Environment
                false, // Is shell?
                null, // Command
                ["jobmanager"], // Arguments
                null // User
            ),
            "resources": {
                "cpus": 0.5,
                "mem": 256,
                "ports": 2,
                "disk": 0
            },
            "healthChecks": null, // Add your health checks here
            "labels": null // Add your labels (an array of { "key": "value" } objects)
        },
        "taskmanagers": {
            "priority": 2,
            "instances": 2,
            "allowScaling": true, // Only allow scaling of the TaskManagers
            "executorInfo": null, // Can take a Mesos.ExecutorInfo object
            "containerInfo": ContainerInfo, // Mesos.ContainerInfo object
            "commandInfo": new Mesos.CommandInfo( // Strangely, this is needed, even when specifying ContainerInfo...
                null, // URI
                new Mesos.Environment([
                    new Mesos.Environment.Variable("flink_recovery_mode", "zookeeper"),
                    new Mesos.Environment.Variable("flink_recovery_zookeeper_quorum", "172.17.10.101:2181"),
                    new Mesos.Environment.Variable("flink_recovery_zookeeper_storageDir", "/data/zk"),
                    new Mesos.Environment.Variable("flink_taskmanager_tmp_dirs", "/data/tasks"),
                    new Mesos.Environment.Variable("flink_blob_storage_directory", "/data/blobs"),
                    new Mesos.Environment.Variable("flink_state_backend", "filesystem"),
                    new Mesos.Environment.Variable("flink_taskmanager_numberOfTaskSlots", "1"),
                    new Mesos.Environment.Variable("flink_taskmanager_heap_mb", "1536")
                ]), // Environment
                false, // Is shell?
                null, // Command
                ["taskmanager"], // Arguments
                null // User
            ),
            "resources": {
                "cpus": 0.5,
                "mem": 1536,
                "ports": 3,
                "disk": 0
            },
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

// Start framework scheduler
scheduler.subscribe();
