"use strict";

// Project require
var handlers = require("../lib/schedulerHandlers");
var helpers = require("../lib/helpers");
var TaskHelper = require("../lib/taskHelper");
var winston = require('winston');
var util = require("util");
var EventEmitter = require('events').EventEmitter;
var path = require("path");
var Mesos = require("../lib/mesos")().getMesos();

// Testing require
var expect = require('chai').expect;
var sinon = require("sinon");

describe('Offers handlers tests', function () {

    var accept = true;

    function SchedulerStub() {
        // Inherit from EventEmitter
        EventEmitter.call(this);
        return this;
    };

    var scheduler = new SchedulerStub();

    var Url = {
        "scheme": "http",
        "address": {
            "hostname": "bla.mesos",
            "ip": "127.0.0.1",
            "port": "2121"
        },
        "path": "/bla",
        "fragment": ""
    };

    var offers = {
        "type": "OFFERS",
        "offers": [
            {
                "id": {"value": "12214-23523-O235235"},
                "framework_id": {"value": "12124-235325-32425"},
                "agent_id": {"value": "12325-23523-S23523"},
                "hostname": "agent.host",
                "url": Url,
                "resources": [
                    {
                        "name": "cpus",
                        "type": "SCALAR",
                        "scalar": {"value": 1.1},
                        "role": "*"
                    },
                    {
                        "name": "mem",
                        "role": "*",
                        "type": "SCALAR",
                        "scalar": {"value": 256}
                    },
                    {
                        "name": "disk",
                        "type": "SCALAR",
                        "scalar": {
                            "value": 10000
                        }
                    },
                    {
                        "name": "ports",
                        "role": "*",
                        "type": "RANGES",
                        "ranges": {
                            "range": [
                                {
                                    "begin": 8080,
                                    "end": 8090
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    };

    var ContainerInfo = new Mesos.ContainerInfo(
        Mesos.ContainerInfo.Type.DOCKER, // Type
        null, // Volumes
        null, // Hostname
        new Mesos.ContainerInfo.DockerInfo(
            "tobilg/mini-webserver", // Image
            Mesos.ContainerInfo.DockerInfo.Network.BRIDGE, // Network
            {
                "host_port": 8081,
                "container_port": 0,
                // Protocol to expose as (ie: tcp, udp).
                "protocol": "tcp"
            },
            false, // Privileged
            null,  // Parameters
            false, // forcePullImage
            null   // Volume Driver
        )
    );


    util.inherits(SchedulerStub, EventEmitter);

    before(function () {
        scheduler.decline = function (offers, filters) {
            console.log("Decline the offer");
            accept = false;
        }

        scheduler.accept = function (offerId, operations, filters) {
            console.log("Accept the offer");
            accept = true;
        }
    });

    it('Recive an offer but there are no pending tasks', function (done) {
        scheduler.pendingTasks = [];
        var logger = helpers.getLogger(null, null, "debug");
        scheduler.logger = logger;

        handlers["OFFERS"].call(scheduler, offers);

        setTimeout(function () {
            expect(accept).to.equal(false);
            done();
        }, 500); //timeout with an error in one second
    });


    it('Recive an offer while suitable task is pending', function (done) {

        var task1 = {
            "name": "My Task",
            "task_id": {"value": "12220-3440-12532-my-task"},
            "containerInfo": ContainerInfo,
            "commandInfo": new Mesos.CommandInfo(
                null, // URI
                new Mesos.Environment([
                    new Mesos.Environment.Variable("FOO", "BAR")
                ]), // Environment
                false, // Is shell?
                null, // Command
                null, // Arguments
                null // User
            ),
            "portMappings": [
                {"port": 8081, "protocol": "tcp"}
            ],
            "resources": {
                "cpus": 0.2,
                "mem": 128,
                "ports": 1,
                "disk": 10
            }
        };

        var logger = helpers.getLogger(null, null, "debug");

        scheduler.pendingTasks = [task1];
        scheduler.launchedTasks = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {"frameworkName": "myfmw"}

        handlers["OFFERS"].call(scheduler, offers);

        setTimeout(function () {
            expect(accept).to.equal(true);
            expect(scheduler.launchedTasks.length).to.equal(1);
            expect(scheduler.launchedTasks[0].runtimeInfo.agentId).to.equal("12325-23523-S23523");
            done();
        }, 500); //timeout with an error in one second
    });

    it('Recive an offer while suitable task with runtimeInfo is pending', function (done) {

        var runtimeInfo = {agentId: "12345"}
        var task1 = {
            "name": "My Task",
            "task_id": {"value": "12220-3440-12532-my-task"},
            "containerInfo": ContainerInfo,
            "runtimeInfo": runtimeInfo,
            "commandInfo": new Mesos.CommandInfo(
                null, // URI
                new Mesos.Environment([
                    new Mesos.Environment.Variable("FOO", "BAR")
                ]), // Environment
                false, // Is shell?
                null, // Command
                null, // Arguments
                null // User
            ),
            "resources": {
                "cpus": 0.2,
                "mem": 128,
                "ports": 2,
                "disk": 10
            }
        };

        var logger = helpers.getLogger(null, null, "debug");

        scheduler.pendingTasks = [task1];
        scheduler.launchedTasks = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {"frameworkName": "myfmw"}

        handlers["OFFERS"].call(scheduler, offers);

        setTimeout(function () {
            expect(accept).to.equal(true);
            expect(scheduler.launchedTasks.length).to.equal(1);
            expect(scheduler.launchedTasks[0].runtimeInfo.agentId).to.equal("12325-23523-S23523");
            done();
        }, 500); //timeout with an error in one second
    });


    it('Recive an offer while unsuitable task is pending', function (done) {

        var task1 = {
            "name": "My Task",
            "task_id": {"value": "12220-3440-12532-my-task"},
            "commandInfo": new Mesos.CommandInfo(
                null, // URI
                new Mesos.Environment([
                    new Mesos.Environment.Variable("FOO", "BAR")
                ]), // Environment
                false, // Is shell?
                null, // Command
                null, // Arguments
                null // User
            ),
            "resources": {
                "cpus": 0.2,
                "mem": 1280,
                "ports": 2,
                "disk": 0
            }
        };

        var logger = helpers.getLogger(null, null, "debug");

        scheduler.pendingTasks = [task1];
        scheduler.launchedTasks = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {"frameworkName": "myfmw"}

        handlers["OFFERS"].call(scheduler, offers);

        setTimeout(function () {
            expect(accept).to.equal(false);
            done();
        }, 500); //timeout with an error in one second
    });
});


describe('Update handlers tests', function () {

    var acknowleged;
    var killed;

    beforeEach(function () {
        acknowleged = false;
        killed = false;
    });


    function SchedulerStub() {
        // Inherit from EventEmitter
        EventEmitter.call(this);
        return this;
    };

    var scheduler = new SchedulerStub();

    /**
     * Acknowledge a status update.
     * @param {object} update The status update to acknowledge.
     */
    scheduler.acknowledge = function (update) {

        if (!update.status.uuid) {
            acknowleged = false;
            return;
        }

        acknowleged = true;
    };

    scheduler.kill  = function (taskId, agentId) {
        killed = true
    };

    var runtimeInfo = {agentId: "12345", executorId: "5457"}
    var task1 = {
        "name": "my-task",
        "taskId": "12344-my-task",
        "runtimeInfo": runtimeInfo,
        "commandInfo": new Mesos.CommandInfo(
            null, // URI
            new Mesos.Environment([
                new Mesos.Environment.Variable("FOO", "BAR")
            ]), // Environment
            false, // Is shell?
            null, // Command
            null, // Arguments
            null // User
        ),
        "resources": {
            "cpus": 0.2,
            "mem": 1280,
            "ports": 2,
            "disk": 0
        }
    };


    it('Recive an update no uuid', function (done) {

        var update = {
            "status": {
                "task_id": {"value": "12344-my-task"},
                "state": "TASK_RUNNING",
                "source": "SOURCE_EXECUTOR",
                "bytes": "uhdjfhuagdj63d7hadkf"
            }
        };


        var logger = helpers.getLogger(null, null, "debug");

        scheduler.pendingTasks = [];
        scheduler.launchedTasks = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {
            "frameworkName": "myfmw",
            "restartStates": ["TASK_FAILED", "TASK_KILLED", "TASK_LOST", "TASK_ERROR", "TASK_FINISHED"]
        }

        handlers["UPDATE"].call(scheduler, update);
        setTimeout(function () {
            expect(acknowleged).to.equal(false);
            done();
        }, 500); //timeout with an error in one second

    });

    it('Recive an update with uuid', function (done) {

        var logger = helpers.getLogger(null, null, "debug");

        var update = {
            "status": {
                "task_id": {"value": "12344-my-task"},
                "state": "TASK_RUNNING",
                "source": "SOURCE_EXECUTOR",
                "bytes": "uhdjfhuagdj63d7hadkf",
                "uuid": "jhadf73jhakdlfha723adf"
            }
        };

        scheduler.pendingTasks = [];
        scheduler.launchedTasks = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {
            "frameworkName": "myfmw",
            "restartStates": ["TASK_FAILED", "TASK_KILLED", "TASK_LOST", "TASK_ERROR", "TASK_FINISHED"]
        }

        handlers["UPDATE"].call(scheduler, update);
        setTimeout(function () {
            expect(acknowleged).to.equal(true);
            done();
        }, 500); //timeout with an error in one second

    });

    it('Recive an update for launched task to be killed - no restart', function (done) {

        var logger = helpers.getLogger(null, null, "debug");

        var update = {
            "status": {
                "task_id": {"value": "12344-my-task"},
                "state": "TASK_KILLED",
                "source": "SOURCE_EXECUTOR",
                "bytes": "uhdjfhuagdj63d7hadkf",
                "uuid": "jhadf73jhakdlfha723adf",
                "executor_id": {"value": "12344-my-executor"},
                "agent_id": {"value": "12344-my-agent"}
            }
        };

        var taskHelper = sinon.createStubInstance(TaskHelper);
        scheduler.taskHelper = taskHelper;

        var runtimeInfo = {agentId: "12345"}

        scheduler.pendingTasks = [];
        scheduler.launchedTasks = [task1];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {
            "frameworkName": "myfmw",
            "restartStates": ["TASK_FAILED", "TASK_LOST", "TASK_ERROR", "TASK_FINISHED"]
        };

        scheduler.options.useZk = true;

        handlers["UPDATE"].call(scheduler, update);
        setTimeout(function () {
            expect(scheduler.launchedTasks.length).to.equal(0);
            expect(scheduler.taskHelper.deleteTask())
            done();
        }, 500); //timeout with an error in one second

    });

    it('Recive an update for launched task to be killed - restart', function (done) {

        var logger = helpers.getLogger(null, null, "debug");

        var update = {
            "status": {
                "task_id": {"value": "12344-my-task"},
                "state": "TASK_KILLED",
                "source": "SOURCE_EXECUTOR",
                "bytes": "uhdjfhuagdj63d7hadkf",
                "uuid": "jhadf73jhakdlfha723adf",
                "executor_id": {"value": "12344-my-executor"},
                "agent_id": {"value": "12344-my-agent"}
            }
        };

        scheduler.pendingTasks = [];
        scheduler.launchedTasks = [task1];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {
            "frameworkName": "myfmw",
            "restartStates": ["TASK_FAILED", "TASK_KILLED", "TASK_LOST", "TASK_ERROR", "TASK_FINISHED"]
        }

        handlers["UPDATE"].call(scheduler, update);
        setTimeout(function () {
            expect(scheduler.pendingTasks.length).to.equal(1);
            done();
        }, 500); //timeout with an error in one second

    });

    it('Recive an update for launched task is failed - no restart', function (done) {

        var logger = helpers.getLogger(null, null, "debug");

        var update = {
            "status": {
                "task_id": {"value": "12344-my-task"},
                "state": "TASK_FAILED",
                "source": "SOURCE_EXECUTOR",
                "bytes": "uhdjfhuagdj63d7hadkf",
                "uuid": "jhadf73jhakdlfha723adf",
                "executor_id": {"value": "12344-my-executor"},
                "agent_id": {"value": "12344-my-agent"}
            }
        };

        scheduler.pendingTasks = [];
        scheduler.launchedTasks = [task1];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {
            "frameworkName": "myfmw",
            "restartStates": ["TASK_KILLED", "TASK_LOST", "TASK_ERROR", "TASK_FINISHED"]
        };

        handlers["UPDATE"].call(scheduler, update);
        setTimeout(function () {
            expect(scheduler.launchedTasks[0].runtimeInfo.state).to.equal("TASK_FAILED");
            done();
        }, 500); //timeout with an error in one second

    });


    it('Recive an update after reconciliation - no delete', function (done) {

        var logger = helpers.getLogger(null, null, "debug");

        var update = {
            "status": {
                "task_id": {"value": "12345-my-task"},
                "state": "TASK_RUNNING",
                "source": "SOURCE_EXECUTOR",
                "bytes": "uhdjfhuagdj63d7hadkf",
                "uuid": "jhadf73jhakdlfha723adf",
                "executor_id": {"value": "12344-my-executor"},
                "agent_id": {"value": "12344-my-agent"},
                "reason": "REASON_RECONCILIATION"
            }
        };

        scheduler.pendingTasks = [];
        scheduler.launchedTasks = [task1];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {
            "frameworkName": "myfmw",
            "restartStates": ["TASK_KILLED", "TASK_LOST", "TASK_ERROR", "TASK_FINISHED"]
        };

        scheduler.options.killUnknownTasks = false;

        handlers["UPDATE"].call(scheduler, update);
        setTimeout(function () {
            expect(killed).to.equal(false);
            done();
        }, 500); //timeout with an error in one second

    });


    it('Recive an update after reconciliation - delete', function (done) {

        var logger = helpers.getLogger(null, null, "debug");

        var update = {
            "status": {
                "task_id": {"value": "12345-my-task"},
                "state": "TASK_RUNNING",
                "source": "SOURCE_EXECUTOR",
                "bytes": "uhdjfhuagdj63d7hadkf",
                "uuid": "jhadf73jhakdlfha723adf",
                "executor_id": {"value": "12344-my-executor"},
                "agent_id": {"value": "12344-my-agent"},
                "reason": "REASON_RECONCILIATION"
            }
        };

        scheduler.pendingTasks = [];
        scheduler.launchedTasks = [task1];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {
            "frameworkName": "myfmw",
            "restartStates": ["TASK_KILLED", "TASK_LOST", "TASK_ERROR", "TASK_FINISHED"]
        };

        scheduler.options.killUnknownTasks = true;

        handlers["UPDATE"].call(scheduler, update);
        setTimeout(function () {
            expect(killed).to.equal(true);
            done();
        }, 500); //timeout with an error in one second

    });
});