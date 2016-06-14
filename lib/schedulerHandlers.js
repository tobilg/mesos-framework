"use strict";
var uuid = require('uuid');

var helpers = require("./helpers");
var Mesos = new (require("./mesos"))();

var mesos = Mesos.getMesos();
var builder = Mesos.getBuilder();

module.exports = {
    "SUBSCRIBED": function (subscribed) {
    },
    "OFFERS": function (Offers) {

        var self = this;
        var unusableOffers = [];
        var toLaunch = [];

        // Check if we need to start instances
        if (self.desiredInstances > (self.requestedInstances + Object.getOwnPropertyNames(self.runningTasks).length)) {

            // Iterate over the given offers
            Offers.offers.forEach(function (offer) {

                var demandedResources = [];
                var offerResourceMap = {};
                var resourcesLength = self.options.resources.length,
                    resourcesOk = 0;

                // Create offerRecource map
                offer.resources.forEach(function (offerResource) {
                    if (offerResource.type === "SCALAR") {
                        offerResourceMap[offerResource.name] = offerResource.scalar.value;
                    }
                });

                // Iterate over demanded resources
                self.options.resources.forEach(function (resource) {
                    // Instantiate as Resource
                    var Resource = new (builder.build("mesos.Resource"))(resource);
                    // Check if offer has enough resources
                    if (Resource.type === mesos.Value.Type.SCALAR && offerResourceMap[Resource.name] >= Resource.scalar.value) {
                        demandedResources.push(helpers.stringifyEnumsRecursive(Resource));
                        resourcesOk++;
                    }
                });

                // Check if all resource requests can be fulfilled
                if (resourcesLength === resourcesOk) {

                    // Double-check if we still need additional instances
                    if (self.desiredInstances > (self.requestedInstances + Object.getOwnPropertyNames(self.runningTasks).length)) {

                        // Get unique taskId
                        var taskId = self.options.frameworkName + "." + uuid.v4();

                        var offers = [],
                            taskInfos = [];

                        // Push Offer
                        offers.push(offer.id);

                        // Push TaskInfo
                        taskInfos.push(new mesos.TaskInfo(self.options.frameworkName, new mesos.TaskID(taskId), offer.agent_id, demandedResources, self.options.executorInfo, self.options.commandInfo, self.options.containerInfo));

                        // Push to launch array
                        toLaunch.push({ offers: offers, taskInfos: taskInfos });

                        // Add to requested instances. Those will be decreased once a Task was started successfully
                        self.requestedInstances++;

                        // Reset
                        resourcesOk = 0;

                    } else {
                        // Add to unusable offers
                        unusableOffers.push(offer.id);
                    }

                } else {
                    // Add to unusable offers
                    unusableOffers.push(offer.id);
                }

            });

            // Accept all usable offers
            if (toLaunch.length > 0) {

                toLaunch.forEach(function (launchTask) {
                    process.nextTick(function () {
                        // Set the Operations object
                        var Operations = helpers.stringifyEnumsRecursive(new mesos.Offer.Operation(mesos.Offer.Operation.Type.LAUNCH, new mesos.Offer.Operation.Launch(launchTask.taskInfos)));
                        // Trigger acceptance
                        self.accept(launchTask.offers, Operations, null);
                    });
                });

            }

            // Decline all unusable offers
            if (unusableOffers.length > 0) {
                process.nextTick(function () {
                    // Trigger decline
                    self.decline(unusableOffers, null);
                });
            }

        } else {

            // Iterate over the given offers
            Offers.offers.forEach(function (offer) {

                var Offer = new (builder.build("mesos.Offer"))(offer);

                unusableOffers.push(Offer.id);

            });

            // Decline the unusable offers
            self.decline(unusableOffers, null);

        }

    },
    "UPDATE": function (update) {

        var self = this;

        function updateTask (status) {
            // Reduce the requested instances
            self.requestedInstances--;
            // Store task in running tasks
            self.runningTasks[status.task_id.value] = {
                agent_id: status.agent_id.value,
                executor_id: status.executor_id.value,
                state: status.state
            };
            self.emit("updated_task", self.runningTasks[status.task_id.value]);
        }

        function removeTask (status) {
            // Remove task from running tasks
            delete self.runningTasks[status.task_id.value];
            self.emit("removed_task", status.task_id.value);
        }

        switch (update.status.state) {
            case "TASK_STARTING":
                updateTask(update.status);
                break;
            case "TASK_RUNNING":
                updateTask(update.status);
                break;
            case "TASK_KILLING":
                updateTask(update.status);
                break;
            case "TASK_FINISHED":
                removeTask(update.status);
                break;
            case "TASK_FAILED":
                removeTask(update.status);
                break;
            case "TASK_KILLED":
                removeTask(update.status);
                break;
            case "TASK_LOST":
                removeTask(update.status);
                break;
            case "TASK_ERROR":
                removeTask(update.status);
                break;
            default:
                break;
        }

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
