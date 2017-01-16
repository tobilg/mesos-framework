"use strict";

var http = require("http");

/**
 * Represents a TaskHealthHelper object
 * @constructor
 * @param {object} scheduler - The scheduler object.
 * @param {object} options - The option map object.
 */
function TaskHealthHelper(scheduler, options) {
    if (!(this instanceof TaskHealthHelper)) {
        return new TaskHealthHelper(scheduler, options);
    }

    var self = this;

    self.scheduler = scheduler;
    self.logger = scheduler.logger;
    self.options = {};
    self.options.interval = options.interval || 30;
    self.options.graceCount = options.graceCount || 4;
    self.options.portIndex = options.portIndex || 0;
    self.options.errorEvent = options.errorEvent || "task_unhealthy";
    self.options.additionalProperties = options.additionalProperties || [];
    self.options.taskNameFilter = options.taskNameFilter || null;
    self.options.statusCodes = options.statusCodes || [200];
    self.options.propertyPrefix = options.propertyPrefix || "";
    if (options.url) {
        self.options.url = options.url;
    } else {
        throw new Error("Must set URL");
    }

    self.healthRequestCreate = function (host, port) {
        return {
            "host": host,
            "port": port,
            "path": options.url,
            "method": "GET",
            headers: {}
        };
    };

    self.checkRunningInstances = function () {

        self.logger.debug("Running periodic healthcheck" + (self.options.propertyPrefix.length ? ", prefix: " + self.options.propertyPrefix : ""));

        self.scheduler.launchedTasks.forEach(function (task) {
            self.checkInstance.call(self, task);
        });
    };
}

TaskHealthHelper.prototype.taskFilter = function (name) {
    var self = this;
    if (self.options.taskNameFilter) {
        return name.match(self.options.taskNameFilter) !== null;
    }
    return true;
};

TaskHealthHelper.prototype.setCheckFailed = function (task) {

    var self = this;

    if (task.runtimeInfo[self.options.propertyPrefix + "checkFailCount"] === undefined) {
        task.runtimeInfo[self.options.propertyPrefix + "checkFailCount"] = 0;
    }
    task.runtimeInfo[self.options.propertyPrefix + "checkFailCount"] += 1;
    self.logger.debug("Task found unhealthy" + (self.options.propertyPrefix.length ? ", prefix: " + self.options.propertyPrefix : ""));
    if (task.runtimeInfo[self.options.propertyPrefix + "checkFailCount"] === self.options.graceCount) {
        self.logger.debug("Task marked unhealthy" + (self.options.propertyPrefix.length ? ", prefix: " + self.options.propertyPrefix : ""));
        task.runtimeInfo[self.options.propertyPrefix + "healthy"] = false;
        self.options.additionalProperties.forEach(function (property) {
            if (property.setUnhealthy) {
                var value = false;
                if (property.inverse) {
                    value = !value;
                }
                task.runtimeInfo[property.name] = value;
            }
        });
        self.scheduler.emit(self.options.errorEvent, task);
    } else if (task.runtimeInfo[self.options.propertyPrefix + "healthy"] === false) {
        self.scheduler.emit(self.options.errorEvent, task);
    }
};

TaskHealthHelper.prototype.checkInstance = function (task) {

    var self = this;

    if (task.runtimeInfo && task.runtimeInfo.state === "TASK_RUNNING" && self.taskFilter(task.name)) {
        if (task.runtimeInfo.network && task.runtimeInfo.network.hostname && task.runtimeInfo.network.ports && task.runtimeInfo.network.ports[self.options.portIndex]) {
            var req = http.request(self.healthRequestCreate(task.runtimeInfo.network.hostname, task.runtimeInfo.network.ports[self.options.portIndex]), function (res) {
                if (self.options.statusCodes.indexOf(res.statusCode) > -1) {
                    task.runtimeInfo[self.options.propertyPrefix + "checkFailCount"] = 0;
                    task.runtimeInfo[self.options.propertyPrefix + "healthy"] = true;
                    self.options.additionalProperties.forEach(function (property) {
                        var value = true;
                        if (property.inverse) {
                            value = !value;
                        }
                        task.runtimeInfo[property.name] = value;
                    });
                } else {
                    self.setCheckFailed.call(self, task);
                }
                res.resume();
            });
            req.on("error", function (error) {
                self.logger.error("Error checking task health:" + JSON.stringify(error) + (self.options.propertyPrefix.length ? ", prefix: " + self.options.propertyPrefix : ""));
                self.setCheckFailed.call(self, task);
            });
            req.end();
        }
    }
};

TaskHealthHelper.prototype.stopHealthCheck = function () {
    var self = this;

    if (self.interval) {
        clearInterval(self.interval);
        self.interval = null;
    }
}

TaskHealthHelper.prototype.setupHealthCheck = function () {
    var self = this;

    self.interval = setInterval(self.checkRunningInstances, self.options.interval * 1000);
};

module.exports = TaskHealthHelper;
