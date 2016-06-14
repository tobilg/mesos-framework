"use strict";

var http = require("http");
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var uuid = require('uuid');

var helpers = require("./helpers");
var executorHandlers = require("./executorHandlers");
var mesos = require("./mesos")().getMesos();

/**
 * Represents a Mesos framework executor.
 * @constructor
 * @param {object} options - The option map object.
 */
function Executor (options) {

    if (!(this instanceof Executor)) {
        return new Executor(options);
    }

    // Inherit from EventEmitter
    EventEmitter.call(this);

    var self = this;
    self.options = {};

    // Optional env variables
    var envMap = {
        "MESOS_CHECKPOINT": "checkpointEnabled",
        "MESOS_EXECUTOR_SHUTDOWN_GRACE_PERIOD": "shutdownGracePeriod",
        "MESOS_RECOVERY_TIMEOUT": "recoveryTimeout",
        "MESOS_SUBSCRIPTION_BACKOFF_MAX": "subscriptionBackoffMax"
    };

    // Check for frameworkId
    if (process.env.MESOS_FRAMEWORK_ID) {
        self.frameworkId = new mesos.FrameworkID(process.env.MESOS_FRAMEWORK_ID);
    } else {
        console.error("No MESOS_FRAMEWORK_ID environment parameter found! Exiting...");
        process.exit(1);
    }

    // Check fo rexecutorId
    if (process.env.MESOS_EXECUTOR_ID) {
        self.executorId = new mesos.ExecutorID(process.env.MESOS_EXECUTOR_ID);
    } else {
        console.error("No MESOS_EXECUTOR_ID environment parameter found! Exiting...");
        process.exit(2);
    }

    // Check for working directory
    if (process.env.MESOS_DIRECTORY) {
        self.workingDirectory = process.env.MESOS_DIRECTORY;
    } else {
        console.error("No MESOS_DIRECTORY environment parameter found! Exiting...");
        process.exit(3);
    }

    // Check for agent endpoint
    if (process.env.MESOS_AGENT_ENDPOINT) {
        var endpointArray = process.env.MESOS_AGENT_ENDPOINT.split(":");
        if (endpointArray.length === 2) {
            self.options.agentUrl = endpointArray[0];
            self.options.port = parseInt(endpointArray[1]);
        } else {
            console.error("MESOS_AGENT_ENDPOINT didn't contain a ip:port combination! Exiting...");
            process.exit(4);
        }
    } else {
        console.log("No MESOS_AGENT_ENDPOINT environment parameter found! Using default values...");
        self.options.agentUrl = options.agentUrl || "127.0.0.1";
        self.options.port = parseInt(options.port) || 5051;
    }

    // Check for other env variables and inline them
    Object.getOwnPropertyNames(envMap).forEach(function (envVariable) {
        if (process.env[envVariable]) {
            self[envMap[envVariable]] = process.env[envVariable];
        }
    });

    // Template for issuing Mesos Scheduler HTTP API requests
    self.requestTemplate = {
        host: self.options.agentUrl,
        port: self.options.port,
        path: "/api/v1/executor",
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        }
    };

    // Customer event handlers will be registered here
    self.customEventHandlers = {};

    // List of allowed event handler function names and their argument length
    var allowedEventHandlers = {
        "SUBSCRIBED": 1,
        "LAUNCH": 1,
        "KILL": 1,
        "ACKNOWLEDGED": 1,
        "MESSAGE": 1,
        "ERROR": 1,
        "SHUTDOWN": 1
    };

    // Add custom event handlers if present
    if (options.handlers && Object.getOwnPropertyNames(options.handlers).length > 0) {
        Object.getOwnPropertyNames(options.handlers).forEach(function (handlerName) {
            // Check if name is allowed, is a function and the length of the function arguments fit to the ones defined in allowedEventHandlers
            if (Object.getOwnPropertyNames(allowedEventHandlers).indexOf(handlerName.toUpperCase()) > -1 && helpers.isFunction(options.handlers[handlerName]) && options.handlers[handlerName].length === allowedEventHandlers[handlerName]) {
                self.customEventHandlers[handlerName.toUpperCase()] = options.handlers[handlerName];
            }
        });
    }

}

// Inhertit from EventEmitter
util.inherits(Executor, EventEmitter);

/**
 * Subscribes the framework executor to the according Mesos agent.
 */
Executor.prototype.subscribe = function () {

    var self = this;

    /**
     * The handler funciton for the incoming Mesos agent events for this executor.
     * @param {object} eventData - The data object for an incoming event. Contains the event details (type etc.).
     */
    function handleEvent (eventData) {

        try {

            var event = JSON.parse(eventData);

            // Determine event handler, use custom one if it exists
            if (self.customEventHandlers[event.type]) {
                // Call custom handler
                self.customEventHandlers[event.type].call(self, event[event.type.toLocaleLowerCase()]);
            } else {
                // Call default handler
                schedulerHandlers[event.type].call(self, event[event.type.toLocaleLowerCase()]);
            }

            // Emit original objects
            self.emit(event.type.toLocaleLowerCase(), event[event.type.toLocaleLowerCase()]);

        } catch (error) {
            self.emit("error", { message: "Couldn't parse as JSON: " + eventData, stack: (error.stack || "") });
        }

    }

    var req = http.request(self.requestTemplate, function (res) {

        // Set encoding to UTF8
        res.setEncoding('utf8');

        if (res.statusCode === 200) {
            self.emit("sent_subscribe", { mesosStreamId: self.mesosStreamId });

        }

        // Local cache for chunked JSON messages
        var cache = "";

        // Watch for data/chunks
        res.on('data', function (chunk) {

            console.log("BODY: " + chunk);

            var expectedLength = 0;

            if (chunk.indexOf("\n") > -1) {
                var temp = chunk.split("\n");
                if (temp.length === 2) {
                    expectedLength = parseInt(temp[0]);
                    if (temp[1].length < expectedLength) {
                        // Add to cache
                        cache += temp[1];
                    } else {
                        // Empty cache
                        cache = "";
                        // Handle event
                        handleEvent(temp[1]);
                    }
                } else {
                    self.emit("error", { message: "Other linebreak count found than expected! Actual count: " + temp.length });
                }
            } else {
                if (cache.length > 0) {
                    // Concatenate cached partial data with this chunk, replace the erroneous parts
                    var eventData = cache + chunk;
                    // Handle event
                    handleEvent(eventData);
                    // Empty cache
                    cache = "";
                }
            }
        });

        res.on('end', function () {
            self.emit("error", { message: "Long-running connection was closed!" });
        });

    });

    req.on('error', function (e) {
        self.emit("error", { message: "There was a problem with the request: " + e.message});
    });

    // write data to request body
    req.write(JSON.stringify({
        "type": "SUBSCRIBE",
        "framework_id": self.frameworkId,
        "executor_id": self.executorId
    }));

    req.end();

};

/**
 *  Communicate the state of managed tasks. It is crucial that a terminal update (e.g., TASK_FINISHED, TASK_KILLED or TASK_FAILED) is sent to the agent as soon as the task terminates, in order to allow Mesos to release the resources allocated to the task.
 *  The scheduler must explicitly respond to this call through an ACKNOWLEDGE message (see ACKNOWLEDGED in the Events section below for the semantics). The executor must maintain a list of unacknowledged updates. If for some reason, the executor is disconnected from the agent, these updates must be sent as part of SUBSCRIBE request in the unacknowledged_updates field.
 *  @param {Object} taskStatus The {@link https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L1330|TaskStatus} object containing the update details.
 */
Executor.prototype.update = function (taskStatus) {

    var self = this;

    var payload = {
        "type": "UPDATE",
        "framework_id": self.frameworkId,
        "executor_id": self.executorId,
        "update": {
            "status": taskStatus
        }
    };

    helpers.doRequest.call(self, payload, function (error, response) {
        if (error) {
            self.emit("error", error.message);
        } else {
            self.emit("sent_update");
        }
    });
    
};

/**
 * Send arbitrary data to the scheduler. Note that Mesos neither interprets this data nor makes any guarantees about the delivery of this message to the executor.
 * @param {string} data The string which's raw bytes will be encoded in Base64.
 */
Executor.prototype.message = function (data) {

    var self = this;

    var payload = {
        "type": "MESSAGE",
        "framework_id": self.frameworkId,
        "executor_id": self.executorId,
        "message": {
            "data": new Buffer(data).toString('base64')
        }
    };

    helpers.doRequest.call(self, payload, function (error, response) {
        if (error) {
            self.emit("error", error.message);
        } else {
            self.emit("sent_message");
        }
    });

};

module.exports = Executor;
