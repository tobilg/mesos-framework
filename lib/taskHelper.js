"use strict";

/**
 * Represents a TaskHelper object
 * @constructor
 * @param {object} scheduler - The scheduler object.
 */
function TaskHelper(scheduler) {
    if (!(this instanceof TaskHelper)) {
        return new TaskHelper(scheduler);
    }
    var self = this;
    self.zkClient = scheduler.zkClient;
    self.scheduler = scheduler;
    self.logger = scheduler.logger;
    self.zkServicePath = self.scheduler.zkServicePath;
}

/**
 * Load the task nodes belonging to the framework from ZooKeeper.
 */
TaskHelper.prototype.loadTasks = function() {
    var self = this;
    self.zkClient.getChildren(self.zkServicePath + "/tasks", function (error, children, stat) {
        if (error) {
            self.logger.error("Could not load task information.");
        } else if (children) {
            var childStates = {};
            children.forEach(function (child) {
                self.zkClient.getData(self.zkServicePath + "/tasks/" + child, function (error, data, stat) {
                    if (error || !data) {
                        self.logger.error("Could not load task information for " + child);
                        if (!error) {
                            self.deleteTask(child);
                        }
                        childStates[child] = {'loaded': false};
                        self.logger.debug("childStates length " + Object.keys(childStates).length.toString() + " children.length " + children.length.toString());
                        if (Object.keys(childStates).length == children.length) {
                            // We're ready to subscribe
                            self.scheduler.emit("ready");
                        }
                        return;
                    }
                    var pending = self.scheduler.pendingTasks;
                    self.scheduler.pendingTasks = [];
                    var task = JSON.parse(data.toString());
                    self.logger.debug("Loading task: " + JSON.stringify(task));
                    var found = false;
                    var i = 0;
                    for (i = 0;i < pending.length; i++) {
                        var pendingTask = pending[i];
                        self.logger.debug("Pending task: \"" + JSON.stringify(pendingTask) + "\"");
                        if (pendingTask.name == task.name) {
                            // Don't load tasks in staging
                            if (task.runtimeInfo && task.runtimeInfo.agentId) {
                                self.scheduler.launchedTasks.push(task);
                                pending.splice(i, 1);
                                self.scheduler.reconcileTasks.push(task);
                            } else {
                                self.deleteTask(task.taskId);
                            }
                            found = true;
                            break;
                        }
                    }
                    if (i == pending.length && !found) {
                        self.logger.info("Setting task ID " + task.taskId + " to be killed");
                        self.scheduler.killTasks.push(task);
                    }
                    self.scheduler.pendingTasks = pending;
                    childStates[child] = {'loaded': true};
                    self.logger.debug("childStates length " + Object.keys(childStates).length.toString() + " children.length " + children.length.toString());
                    if (Object.keys(childStates).length == children.length) {
                        // We're ready to subscribe
                        self.scheduler.emit("ready");
                    }
                });
            });
            if (children.length == 0) {
                // We're ready to subscribe
                self.scheduler.emit("ready");
            }
        }

        
    });
};

/**
 * Save task nodes from ZooKeeper.
 * @param {object} task - The task object which should be persisted to ZooKeeper.
 */
TaskHelper.prototype.saveTask = function (task) {
    var self = this;
    var data = Buffer(JSON.stringify(task));
    // Seperating path creation from data save due to various client bugs.
    self.zkClient.mkdirp(self.zkServicePath+"/tasks/" + task.taskId, function (error, stat){
        if (error) {
            self.logger.error("Got error when creating task node in ZK " + task.name + " ID " + task.taskId + " data: " + error);
            return;
        }
        self.zkClient.setData(self.zkServicePath+"/tasks/" + task.taskId, data, function (error, stat) {
            if (error) {
                self.logger.error("Got error when saving task " + task.name + " ID " + task.taskId + " data: " + error);
                return;
            }
            self.logger.debug("Saved task " + task.name + " ID " + task.taskId);
        });
    });
};

/**
 * Delete task nodes from ZooKeeper.
 * @param {string} taskId - The id of the task which should be deleted from ZooKeeper.
 */
TaskHelper.prototype.deleteTask = function (taskId) {
    var self = this;
    self.zkClient.remove(self.zkServicePath + "/tasks/" + taskId, function (error) {
        if (error) {
            self.logger.error("Error deleting task ID " + taskId + " from zookeeper");
        } else {
            self.logger.debug("Deleted task " + taskId + " from zookeeper");
        }
    });
};

module.exports = TaskHelper;
