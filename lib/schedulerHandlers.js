"use strict";
var uuid = require('uuid');

var helpers = require("./helpers");
var Mesos = new (require("./mesos"))();

var mesos = Mesos.getMesos();

function searchPortsInRanges(task, offerResources, usableRanges, neededStaticPorts, neededPorts) {
    var self = this;

    var tempPortRanges = [];
    var usedPorts = [];

    var begin = 0;
    var stop = false;
    var range;
    var newBegin;
    var newEnd;
    var i;
    var index;
    var port;
    while (neededStaticPorts > 0 && !stop && offerResources.portRanges && offerResources.portRanges.length > 0) {
        range = offerResources.portRanges.splice(0, 1)[0]; // Get first remaining range

        if (range.begin <= task.resources.staticPorts[begin] && range.end >= task.resources.staticPorts[task.resources.staticPorts.length - 1]) {
            usableRanges.push(new mesos.Value.Range(range.begin, task.resources.staticPorts[task.resources.staticPorts.length - 1]));
            newBegin = range.begin;
            newEnd = range.end;
            i = begin;
            while (i < task.resources.staticPorts.length) {
                port = task.resources.staticPorts[i];

                if (newBegin < port) {
                    // Re-add range below port
                    tempPortRanges.push(new mesos.Value.Range(newBegin, port - 1));
                }
                newBegin = port + 1;
                if (newEnd === port) {
                    newEnd -= 1;
                }
                i += 1;
            }
            if (newBegin <= newEnd) {
                tempPortRanges.push(new mesos.Value.Range(newBegin, newEnd));
            }
            neededStaticPorts = 0;
        } else if (range.begin <= task.resources.staticPorts[begin] && range.end >= task.resources.staticPorts[begin]) {
            usableRanges.push(range);
            // Count the number of ports that are not served.

            for (i = begin; i < task.resources.staticPorts.length; i++) {
                if (task.resources.staticPorts[i] > range.end) {
                    break;
                }
            }

            neededStaticPorts -= i - begin;
            newBegin = range.begin;
            newEnd = range.end;
            index = begin;
            while (index < i) {
                port = task.resources.staticPorts[index];

                if (newBegin < port) {
                    // Re-add range below port
                    tempPortRanges.push(new mesos.Value.Range(newBegin, port - 1));
                }
                if (newBegin <= port) {
                    newBegin = port + 1;
                }
                if (newEnd === port) {
                    newEnd -= 1;
                }
                index += 1;
            }
            if (newBegin <= newEnd) {
                tempPortRanges.push(new mesos.Value.Range(newBegin, newEnd));
            }
            begin = i;
        } else {
            tempPortRanges.push(range);
        }
    }

    if (neededStaticPorts == 0) {
        neededPorts -= task.resources.staticPorts.length;
        usedPorts = task.resources.staticPorts;
        self.logger.debug("Temp ranges: " + JSON.stringify(tempPortRanges));
        offerResources.portRanges = offerResources.portRanges.concat(tempPortRanges);
    }
    return {usedPorts: usedPorts, neededPorts: neededPorts, neededStaticPorts: neededStaticPorts};
}

module.exports = {
    "SUBSCRIBED": function (subscribed) {
    },
    "OFFERS": function (Offers) {

        var self = this;

        // Iterate over all Offers
        Offers.offers.forEach(function (offer) {

            var toLaunch = [];
            var declinedNoPending = false;
            var offerResources = {
                cpus: 0,
                mem: 0,
                disk: 0,
                ports: [],
                portRanges: []
            };

            // Decline Offer directly if there are no pending tasks
            if (self.pendingTasks.length === 0) {

                // Decline offer
                self.decline([offer.id], null);
                // To prevent double decline
                declinedNoPending = true;

            }

            // Iterate over the Resources of the Offer and fill the offerResources object
            // (will be used to match against the requested task resources)
            offer.resources.forEach(function (resource) {
                if (resource.type === "SCALAR" && ["cpus", "mem", "disk"].indexOf(resource.name) > -1) {
                    offerResources[resource.name] += resource.scalar.value;
                } else if (resource.type === "RANGES" && resource.name === "ports") {
                    resource.ranges.range.forEach(function (range) {
                        // Add to ranges
                        offerResources.portRanges.push(range);
                        // Populate port list
                        for (var p = range.begin; p <= range.end; p++) {
                            // Add port to port array
                            offerResources.ports.push(p);
                        }
                    });
                }
            });

            // Now, iterate over all tasks that still need to be run
            self.pendingTasks.forEach(function (task) {

                self.logger.debug("pendingTask: " + JSON.stringify(task));

                // Match the task resources to the offer resources
                self.logger.debug("CPUs in offer:" + offerResources.cpus.toString() + " Memory in offer: " + offerResources.mem.toString() + " Port num in offer: " + offerResources.ports.length.toString());
                if (task.resources.cpus <= offerResources.cpus && task.resources.mem <= offerResources.mem && task.resources.disk <= offerResources.disk && (task.resources.ports <= offerResources.ports.length || (self.options.staticPorts && task.resources.staticPorts && task.resources.staticPorts.length <= offerResources.ports.length))) {
                    self.logger.debug("Offer " + offer.id.value + " has resources left");

                    // Environment variables
                    var envVars = [];

                    var demandedResources = [
                        helpers.stringifyEnumsRecursive(new mesos.Resource("cpus", mesos.Value.Type.SCALAR, new mesos.Value.Scalar(task.resources.cpus))),
                        helpers.stringifyEnumsRecursive(new mesos.Resource("mem", mesos.Value.Type.SCALAR, new mesos.Value.Scalar(task.resources.mem)))
                    ];

                    // Reduce available offer cpu and mem resources by requested task resources
                    offerResources.cpus -= task.resources.cpus;
                    offerResources.mem -= task.resources.mem;

                    if (task.resources.disk > 0) {
                        demandedResources.push(helpers.stringifyEnumsRecursive(new mesos.Resource("disk", mesos.Value.Type.SCALAR, new mesos.Value.Scalar(task.resources.disk))));
                        // Reduce disk resources by requested task resources
                        offerResources.disk -= task.resources.disk;
                    }

                    if (task.resources.ports > 0) {
                        var neededPorts = task.resources.ports;
                        var usableRanges = [];
                        var usedPorts = [];
                        var neededStaticPorts = task.resources.staticPorts ? task.resources.staticPorts.length : 0;

                        if (self.options.staticPorts && task.resources.staticPorts && task.resources.staticPorts.length > 0) { // Using fixed ports defined in the framework configuration
                            usedPorts = task.resources.staticPorts;
                            var __ret = searchPortsInRanges.call(self, task, offerResources, usableRanges, neededStaticPorts, neededPorts);
                            usedPorts = __ret.usedPorts;
                            neededPorts = __ret.neededPorts;
                            neededStaticPorts = __ret.neededStaticPorts;
                            self.logger.debug("Needed ports: " + neededPorts + ", UsedPorts: " + usedPorts + ", NeededStaticPorts: " + neededStaticPorts);
                        }
                        // Using dynamic ports (in addition or instead of fixed ports)

                        while (neededPorts > 0 && offerResources.portRanges && offerResources.portRanges.length > 0) {
                            self.logger.debug("portRanges: " + JSON.stringify(offerResources.portRanges));
                            var range = offerResources.portRanges.splice(0, 1)[0]; // Get first remaining range
                            self.logger.debug("actualRange: " + JSON.stringify(range));
                            var availablePorts = (range.end - range.begin + 1);
                            var willUsePorts = (availablePorts >= neededPorts ? neededPorts : availablePorts);
                            // Add to usable ranges
                            usableRanges.push(new mesos.Value.Range(range.begin, range.begin + willUsePorts - 1));
                            // Add to used ports array
                            for (var port = range.begin; port <= (range.begin + willUsePorts - 1); port++) {
                                // Add to used ports
                                usedPorts.push(port);
                                // Remove from ports array / reduce available ports by requested task resources
                                offerResources.ports.splice(offerResources.ports.indexOf(port), 1);
                            }
                            // Push range back portRanges if there are ports left
                            if (availablePorts > willUsePorts) {
                                offerResources.portRanges.push(new mesos.Value.Range(range.begin + willUsePorts, range.end))
                            }
                            // Decrease needed ports number by used ports
                            neededPorts -= willUsePorts;
                        }

                        self.logger.debug("usableRanges: " + JSON.stringify(usableRanges));
                        self.logger.debug(neededPorts);

                        var usedPortRanges = [];
                        var index;

                        for (index = 0; index < usedPorts.length; index += 1) {
                            usedPortRanges.push(new mesos.Value.Range(usedPorts[index], usedPorts[index]));
                        }

                        // Add to demanded resources
                        demandedResources.push(helpers.stringifyEnumsRecursive(new mesos.Resource("ports", mesos.Value.Type.RANGES, null, new mesos.Value.Ranges(usedPortRanges))));
                        // Check if task is a container task, and if so, it the networking mode is BRIDGE and there are port mappings defined
                        if (task.containerInfo) {

                            //self.logger.debug("containerInfo before adding network info: " + JSON.stringify(helpers.stringifyEnumsRecursive(task.containerInfo))); // Container info cannot be printed on it's own.

                            // Add the port mappings if needed
                            if (task.containerInfo.docker.network === "BRIDGE" && task.portMappings && task.portMappings.length > 0) {
                                if (usedPorts.length !== task.portMappings.length) {
                                    self.logger.debug("No match between task's port mapping count and the used/requested port count!");
                                } else {
                                    var portMappings = [],
                                        counter = 0;
                                    // Iterate over given port mappings, and create mapping
                                    task.portMappings.forEach(function (portMapping) {
                                        portMappings.push(new mesos.ContainerInfo.DockerInfo.PortMapping(usedPorts[counter], portMapping.port, portMapping.protocol));
                                        counter++;
                                    });

                                    // Overwrite port mappings
                                    task.containerInfo.docker.port_mappings = portMappings;
                                }

                            }

                            // Add the PORTn environment variables
                            if (usedPorts.length > 0) {
                                var portIndex = 0;
                                // Create environment variables for the used ports (schema is "PORT" appended by port index)
                                usedPorts.forEach(function (port) {
                                    envVars.push(new mesos.Environment.Variable("PORT" + portIndex, port.toString()));
                                    portIndex++;
                                });

                            }

                        }
                    }


                    // Add HOST
                    envVars.push(new mesos.Environment.Variable("HOST", offer.url.address.ip));

                    if (neededPorts > 0 || neededStaticPorts > 0) {
                        self.logger.error("Couldn't find enough ports!");
                    } else {
                        //Check if there are already environment variables set
                        if (task.commandInfo.environment && task.commandInfo.environment.variables && task.commandInfo.environment.variables.length > 0) {
                            // Merge the arrays
                            task.commandInfo.environment.variables = task.commandInfo.environment.variables.concat(envVars);
                        } else { // Just set them
                            task.commandInfo.environment = new mesos.Environment(envVars);
                        }

                        //self.logger.debug("commandInfo after adding network info: " + JSON.stringify(helpers.stringifyEnumsRecursive(task.commandInfo)));

                        // Get unique taskId
                        var taskId = self.options.frameworkName + "." + task.name.replace(/\//, "_") + "." + uuid.v4();

                        // Set taskId
                        task.taskId = taskId;

                        self.logger.debug(JSON.stringify(task));

                        if (task.healthCheck && task.healthCheck.http) {
                            var portIndex = task.healthCheck.http.port ? task.healthCheck.http.port : 0;
                            var httpHealthCheck = new mesos.HealthCheck.HTTP(usedPorts[portIndex], task.healthCheck.http.path, 200);
                            self.logger.debug("Http healthCheck" + JSON.stringify(httpHealthCheck));
                            task.mesosHealthCheck = new mesos.HealthCheck(httpHealthCheck); // setting it so it can be cleaned up.
                        }

                        task.mesosName = task.name.replace(/\//, "_");

                        if (!self.options.serialNumberedTasks) {
                            task.mesosName = task.mesosName.replace(/-[0-9]+$/, ""); // removing serial from mesos task info
                        }
                        self.logger.debug("Mesos task name: " + task.mesosName + " is using serialNumberedTasks: " + self.options.serialNumberedTasks.toString());
                        // Push TaskInfo to toLaunch
                        toLaunch.push(
                            new mesos.TaskInfo(
                                task.mesosName, // Task name
                                new mesos.TaskID(taskId),   // TaskID
                                offer.agent_id,             // AgentID
                                demandedResources,          // Resources
                                (task.executorInfo ? task.executorInfo : null),   // ExecutorInfo
                                (task.commandInfo ? task.commandInfo : null),     // CommandInfo
                                (task.containerInfo ? task.containerInfo : null), // ContainerInfo
                                (task.mesosHealthCheck ? helpers.stringifyEnumsRecursive(task.mesosHealthCheck) : null),     // HealthCheck
                                null, // KillPolicy
                                null, // Data
                                (task.labels ? task.labels : null), // Labels
                                null  // DiscoveryInfo
                            )
                        );

                        // Set submit status
                        task.isSubmitted = true;

                        // Set network runtime info from offer and used ports
                        if (!task.runtimeInfo) {
                            task.runtimeInfo = {};
                            task.runtimeInfo.agentId = offer.agent_id.value || null;
                            task.runtimeInfo.state = "TASK_STAGING";
                            task.runtimeInfo.network = {
                                "hostname": offer.hostname,
                                "ip": offer.url.address.ip || null,
                                "ports": usedPorts
                            };

                        } else {
                            task.runtimeInfo.state = "TASK_STAGING";
                            task.runtimeInfo.agentId = offer.agent_id.value || null;
                            task.runtimeInfo.network = {
                                "hostname": offer.hostname,
                                "ip": offer.url.address.ip || null,
                                "ports": usedPorts
                            };
                        }

                        self.logger.debug("task details for taskId " + task.taskId + ": " + JSON.stringify(task));

                        self.logger.debug("TaskInfo before launch: " + JSON.stringify(helpers.stringifyEnumsRecursive(toLaunch[toLaunch.length - 1])));

                        // Remove from pendingTasks!
                        self.pendingTasks.splice(self.pendingTasks.indexOf(task), 1);

                        self.logger.debug("pendingTask length: " + self.pendingTasks.length);

                        // Add to launched tasks
                        self.launchedTasks.push(task);

                        // Save to ZooKeeper
                        if (self.options.useZk && self.taskHelper) {
                            self.taskHelper.saveTask(task);
                        }

                        self.logger.debug("launchedTasks length: " + self.launchedTasks.length);

                        declinedNoPending = true;
                    }

                    self.logger.debug("Offer " + offer.id.value + ": Available resources: " + offerResources.cpus + " - " + offerResources.mem + " - " + offerResources.disk + " - " + offerResources.ports.length)

                } else {
                    self.logger.error("Offer " + offer.id.value + " has no fitting resources left");
                }

            });

            // Only trigger a launch if there's actually something to launch :-)
            if (toLaunch.length > 0) {

                process.nextTick(function () {
                    // Set the Operations object
                    var Operations = helpers.stringifyEnumsRecursive(
                        new mesos.Offer.Operation(
                            mesos.Offer.Operation.Type.LAUNCH,
                            new mesos.Offer.Operation.Launch(toLaunch)
                        )
                    );

                    self.logger.debug("Operation before accept: " + JSON.stringify(helpers.stringifyEnumsRecursive(Operations)));

                    // Trigger acceptance
                    self.accept([offer.id], Operations, null);
                });
            }

            // Decline offer if not used
            if (!declinedNoPending) {

                process.nextTick(function () {
                    self.logger.debug("Declining Offer " + offer.id.value);
                    // Trigger decline
                    self.decline([offer.id], null);
                });

            }
        });

    },
    "UPDATE": function (update) {

        var self = this;

        self.logger.debug("UPDATE: " + JSON.stringify(update));

        if (update.status.message) {
            self.logger.debug("MESSAGE: " + update.status.message);
        }

        function handleUpdate(status) {

            self.logger.debug(self.options.restartStates + " - " + status.state);

            // Check if the state is defined as a restart state
            if (self.options.restartStates.indexOf(status.state) > -1) {
                self.logger.error("TaskId " + status.task_id.value + " got restartable state: " + status.state);
                // Track launchedTasks array index
                var foundIndex = 0;
                var tempLaunchedTasks = self.launchedTasks.slice();
                // Restart task by splicing it from the launchedTasks array, and afterwards putting it in the pendingTasks array after a cleanup
                tempLaunchedTasks.forEach(function (task) {
                    if (status.task_id.value === task.taskId) {
                        // Check if task was restarted, it means it was already replaced.
                        if (task.runtimeInfo.restarting) {
                            // Remove task from launchedTasks array
                            self.launchedTasks.splice(self.launchedTasks.indexOf(task), 1);
                            self.logger.debug("TaskId " + status.task_id.value + " was killed and removed from the launchedTasks");

                            if (self.options.useZk) {
                                self.taskHelper.deleteTask(status.task_id.value);
                            }
                            return;
                        }
                        // Splice from launchedTasks if found
                        var taskToRestart = helpers.cloneDeep(self.launchedTasks.splice(foundIndex, 1)[0]);
                        self.logger.debug("taskToRestart before cleaning: " + JSON.stringify(taskToRestart));

                        if (self.options.useZk) {
                            self.taskHelper.deleteTask(taskToRestart.taskId);
                        }

                        // Reset isSubmitted status
                        taskToRestart.isSubmitted = false;
                        // Remove old taskId
                        delete taskToRestart.taskId;
                        // Remove old runtimeInfo
                        delete taskToRestart.runtimeInfo;
                        // Remove old health check (it changes by allocated ports)
                        delete task.mesosHealthCheck;
                        // Remove previously set HOST and PORTn environment variables
                        if (taskToRestart.commandInfo.environment.variables && taskToRestart.commandInfo.environment.variables.length > 0) {
                            var usableVariables = [];
                            // Iterate over all environment variables
                            taskToRestart.commandInfo.environment.variables.forEach(function (variable) {
                                // Check if variable name contains either HOST or PORT -> Set by this framework when starting a task
                                if (variable.name.match(/^HOST$/g) === null && variable.name.match(/^PORT[0-9]+$/g) === null) {
                                    // Add all non-matching (user-defined) environment variables
                                    usableVariables.push(variable);
                                }
                            });
                            // Remove old variables
                            delete taskToRestart.commandInfo.environment.variables;
                            // Add the user-defined variables again
                            taskToRestart.commandInfo.environment.variables = usableVariables;
                        }
                        self.logger.debug("taskToRestart after cleaning: " + JSON.stringify(taskToRestart));
                        // Restart task by putting it in the pendingTasks array
                        self.pendingTasks.push(taskToRestart);
                    } else {
                        foundIndex++;
                    }
                });
            } else {
                self.logger.debug("TaskId " + status.task_id.value + " got state: " + status.state);
                // Keep track of index
                var index = 0;
                var match = false;
                // Iterate over launched tasks
                for (index = 0; index < self.launchedTasks.length; index++) {
                    var task = self.launchedTasks[index];
                    self.logger.debug("task id is " + task.taskId);
                    if (status.task_id.value === task.taskId) {
                        self.logger.debug("Matched TaskId " + status.task_id.value);
                        match = true;
                        // Check if state is TASK_KILLED and TASK_KILLED is not in restartable states array, same for TASK_FINISHED
                        if ((self.options.restartStates.indexOf("TASK_KILLED") === -1 && status.state === "TASK_KILLED") || (self.options.restartStates.indexOf("TASK_FINISHED") === -1 && status.state === "TASK_FINISHED") || (task.runtimeInfo.restarting)) {
                            // Remove task from launchedTasks array
                            self.launchedTasks.splice(index, 1);
                            self.logger.debug("TaskId " + status.task_id.value + " was killed and removed from the launchedTasks");

                            if (self.options.useZk) {
                                self.taskHelper.deleteTask(status.task_id.value);
                            }
                        } else {
                            var taskStartTime = Date.now();
                            // Store network info
                            var network = {};

                            // Remove old runtime info if present
                            if (Object.getOwnPropertyNames(task.runtimeInfo).length > 0) {
                                network = helpers.cloneDeep(task.runtimeInfo.network);
                                if (!status.executor_id || !status.executor_id.value) {
                                    status.executor_id = {value: task.runtimeInfo.executorId};
                                }
                                // Check if we need to emit an event
                                if (task.runtimeInfo.state === "TASK_STAGING" && status.state === "TASK_RUNNING") {
                                    self.emit("task_launched", task);
                                }
                                if (task.runtimeInfo.startTime) {
                                    taskStartTime = task.runtimeInfo.startTime
                                }
                                delete task.runtimeInfo;
                            } else {
                                self.emit("task_launched", task);
                            }
                            // Update task runtime info
                            task.runtimeInfo = {
                                agentId: status.agent_id.value,
                                executorId: status.executor_id.value,
                                state: status.state,
                                startTime: taskStartTime,
                                network: network
                            };
                            self.logger.debug("TaskId " + status.task_id.value + " updated task runtime info: " + JSON.stringify(task.runtimeInfo));

                            // Save task to ZooKeeper
                            if (self.options.useZk) {
                                self.taskHelper.saveTask(task);
                            }
                        }

                    }
                }
                // TODO: Check!
                if (!match && index >= self.launchedTasks.length && status.reason == "REASON_RECONCILIATION") {
                    // Cleaning up unknown tasks
                    if (self.options.killUnknownTasks && status.state == "TASK_RUNNING") {
                        self.logger.info("Killing unknown task ID: " + status.task_id.value + " on agent: " + status.agent_id.value);
                        self.kill(status.task_id.value, status.agent_id.value);
                        // Cleaning up stale tasks from ZK.
                    } else if (status.state != "TASK_RUNNING" && self.options.useZk) {
                        self.logger.info("Cleaning up an unknown task from ZK: " + status.task_id.value);
                        self.taskHelper.deleteTask(status.task_id.value);
                    }
                }

            }
        }

        // Handle status update
        handleUpdate(update.status);

        // Acknowledge update
        self.acknowledge(update);

    },
    "RESCIND": function () {
    },
    "MESSAGE": function (message) {
    },
    "FAILURE": function (failure) {
    },
    "ERROR": function (error) {
    },
    "HEARTBEAT": function (heartbeat) {
    }
};
