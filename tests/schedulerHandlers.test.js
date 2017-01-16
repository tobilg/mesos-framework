"use strict";

// Project require
var handlers = require("../lib/schedulerHandlers");
var helpers = require("../lib/helpers");
var TaskHelper = require("../lib/taskHelper");
var winston = require("winston");
var util = require("util");
var EventEmitter = require("events").EventEmitter;
var path = require("path");
var Mesos = require("../lib/mesos")().getMesos();

// Testing require
var expect = require("chai").expect;
var sinon = require("sinon");

describe("Offers handlers tests", function () {

    var accept = true;

    function SchedulerStub() {
        // Inherit from EventEmitter
        EventEmitter.call(this);
        return this;
    }

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

    var offers;

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

    var task1;

    beforeEach(function () {
        task1 = {
            "name": "My Task-121",
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
        offers = {
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
                                    },
                                    {
                                        "begin": 9000,
                                        "end": 9019
                                    }
                                ]
                            }
                        }
                    ]
                }
            ]
        };
    });

    util.inherits(SchedulerStub, EventEmitter);

    before(function () {
        scheduler.decline = function (offers, filters) {
            console.log("Decline the offer");
            accept = false;
        };

        scheduler.accept = function (offerId, operations, filters) {
            console.log("Accept the offer");
            accept = true;
        };
    });

    it("Recive an offer but there are no pending tasks", function (done) {
        scheduler.pendingTasks = [];
        var logger = helpers.getLogger(null, null, "debug");
        scheduler.logger = logger;

        handlers["OFFERS"].call(scheduler, offers);

        setTimeout(function () {
            expect(accept).to.equal(false);
            done();
        }, 500); //timeout with an error in one second
    });


    it("Recive an offer while suitable task is pending", function (done) {

        var logger = helpers.getLogger(null, null, "debug");

        scheduler.pendingTasks = [task1];
        scheduler.launchedTasks = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {"frameworkName": "myfmw", "serialNumberedTasks": true};

        handlers["OFFERS"].call(scheduler, offers);

        setTimeout(function () {
            expect(accept).to.equal(true);
            expect(scheduler.launchedTasks.length).to.equal(1);
            expect(scheduler.launchedTasks[0].runtimeInfo.agentId).to.equal("12325-23523-S23523");
            expect(scheduler.launchedTasks[0].mesosName).to.equal("My Task-121");
            done();
        }, 500); //timeout with an error in one second
    });


    it("Recive an offer while suitable task is pending - no serialNumberedTasks", function (done) {

        var logger = helpers.getLogger(null, null, "debug");

        scheduler.pendingTasks = [task1];
        scheduler.launchedTasks = [];
        task1.healthCheck = new Mesos.HealthCheck.HTTP(0, "/health", 200);
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {"frameworkName": "myfmw", "serialNumberedTasks": false};

        handlers["OFFERS"].call(scheduler, offers);

        setTimeout(function () {
            expect(accept).to.equal(true);
            expect(scheduler.launchedTasks.length).to.equal(1);
            expect(scheduler.launchedTasks[0].runtimeInfo.agentId).to.equal("12325-23523-S23523");
            expect(scheduler.launchedTasks[0].mesosName).to.equal("My Task");
            done();
        }, 500); //timeout with an error in one second
    });

    it("Recive an offer with insufficient ports", function (done) {

        task1.resources.ports = 50;

        var logger = helpers.getLogger(null, null, "debug");
        scheduler.pendingTasks = [task1];
        scheduler.launchedTasks = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {"frameworkName": "myfmw", "serialNumberedTasks": true}
        handlers["OFFERS"].call(scheduler, offers);
        setTimeout(function () {
            expect(accept).to.equal(false);
            expect(scheduler.launchedTasks.length).to.equal(0);
            expect(scheduler.pendingTasks[0].commandInfo.environment.variables).to.have.lengthOf(1);
            done();
        }, 500); //timeout with an error in one second
    });

    it("Recive an offer with no ports, with no disk", function (done) {
        task1.resources.ports = 0;
        task1.resources.disk = 0;
        task1.resources.staticPorts = undefined;

        var saved = false;

        var logger = helpers.getLogger(null, null, "debug");
        scheduler.pendingTasks = [task1];
        scheduler.launchedTasks = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {"frameworkName": "myfmw", "serialNumberedTasks": true};
        scheduler.options.useZk = true;
        scheduler.taskHelper = {};
        scheduler.taskHelper.saveTask = function (task) {
            expect(saved).to.be.false;
            saved = true;
        };
        scheduler.options.staticPorts = true;
        handlers["OFFERS"].call(scheduler, offers);
        setTimeout(function () {
            expect(accept).to.equal(true);
            expect(saved).to.be.true;
            expect(scheduler.launchedTasks.length).to.equal(1);
            done();
        }, 500); //timeout with an error in one second
    });
    it("Recive an offer with static ports of one range", function (done) {
        task1.resources.ports = 2;
        task1.resources.staticPorts = [8081, 8082];

        var saved = false;

        var logger = helpers.getLogger(null, null, "debug");
        scheduler.pendingTasks = [task1];
        task1.healthCheck = new Mesos.HealthCheck.HTTP(1, "/health", 200);
        scheduler.launchedTasks = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {"frameworkName": "myfmw", "serialNumberedTasks": true};
        scheduler.options.useZk = true;
        scheduler.taskHelper = {};
        scheduler.taskHelper.saveTask = function (task) {
            expect(saved).to.be.false;
            saved = true;
        };
        scheduler.options.staticPorts = true;
        handlers["OFFERS"].call(scheduler, offers);
        setTimeout(function () {
            expect(accept).to.equal(true);
            expect(saved).to.be.true;
            expect(scheduler.launchedTasks.length).to.equal(1);
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[1].name).to.equal("PORT0");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[1].value).to.equal("8081");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[2].name).to.equal("PORT1");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[2].value).to.equal("8082");
            done();
        }, 500); //timeout with an error in one second
    });

    it("Recive an offer with static ports of one range and dynamic ports on the rest", function (done) {
        task1.resources.ports = 31;
        task1.resources.staticPorts = [8081, 8082];

        var logger = helpers.getLogger(null, null, "debug");
        scheduler.pendingTasks = [task1];
        scheduler.launchedTasks = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {"frameworkName": "myfmw", "serialNumberedTasks": true};
        scheduler.options.staticPorts = true;
        handlers["OFFERS"].call(scheduler, offers);
        setTimeout(function () {
            expect(accept).to.equal(true);
            expect(scheduler.launchedTasks.length).to.equal(1);
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[1].name).to.equal("PORT0");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[1].value).to.equal("8081");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[2].name).to.equal("PORT1");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[2].value).to.equal("8082");
            done();
        }, 500); //timeout with an error in one second
    });

    it("Recive an offer with static ports of one range and dynamic ports on the rest", function (done) {
        task1.resources.ports = 31;
        task1.resources.staticPorts = [8090, 9019];

        var logger = helpers.getLogger(null, null, "debug");
        scheduler.pendingTasks = [task1];
        scheduler.launchedTasks = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {"frameworkName": "myfmw", "serialNumberedTasks": true};
        scheduler.options.staticPorts = true;
        handlers["OFFERS"].call(scheduler, offers);
        setTimeout(function () {
            expect(accept).to.equal(true);
            expect(scheduler.launchedTasks.length).to.equal(1);
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[1].name).to.equal("PORT0");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[1].value).to.equal("8090");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[2].name).to.equal("PORT1");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[2].value).to.equal("9019");
            done();
        }, 500); //timeout with an error in one second
    });

    it("Recive an offer with static ports of one range and dynamic ports on the rest - fail", function (done) {
        task1.resources.ports = 32;
        task1.resources.staticPorts = [8090, 9019];

        var logger = helpers.getLogger(null, null, "debug");
        scheduler.pendingTasks = [task1];
        scheduler.launchedTasks = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {"frameworkName": "myfmw", "serialNumberedTasks": true};
        scheduler.options.staticPorts = true;
        handlers["OFFERS"].call(scheduler, offers);
        setTimeout(function () {
            expect(accept).to.equal(false);
            expect(scheduler.launchedTasks.length).to.equal(0);
            done();
        }, 500); //timeout with an error in one second
    });

    it("Recive an offer with static ports of two ranges", function (done) {
        task1.resources.ports = 2;
        task1.resources.staticPorts = [8081, 9001];

        var logger = helpers.getLogger(null, null, "debug");
        scheduler.pendingTasks = [task1];
        scheduler.launchedTasks = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {"frameworkName": "myfmw", "serialNumberedTasks": true};
        scheduler.options.staticPorts = true;
        handlers["OFFERS"].call(scheduler, offers);
        setTimeout(function () {
            expect(accept).to.equal(true);
            expect(scheduler.launchedTasks.length).to.equal(1);
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables).to.have.lengthOf(4);
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[1].name).to.equal("PORT0");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[1].value).to.equal("8081");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[2].name).to.equal("PORT1");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[2].value).to.equal("9001");
            done();
        }, 500); //timeout with an error in one second
    });

    it("Recive an offer with static ports of two ranges and dynamic ports that fill more than one range", function (done) {
        task1.resources.ports = 31;
        task1.resources.staticPorts = [8081,9001];

        var logger = helpers.getLogger(null, null, "debug");
        scheduler.pendingTasks = [task1];
        scheduler.launchedTasks = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {"frameworkName": "myfmw", "serialNumberedTasks": true};
        scheduler.options.staticPorts = true;
        handlers["OFFERS"].call(scheduler, offers);
        setTimeout(function () {
            expect(accept).to.equal(true);
            expect(scheduler.launchedTasks.length).to.equal(1);
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables).to.have.length.above(31);
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[1].name).to.equal("PORT0");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[1].value).to.equal("8081");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[2].name).to.equal("PORT1");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[2].value).to.equal("9001");
            done();
        }, 500); //timeout with an error in one second
    });

    it("Recive an offer unknown range resource", function (done) {
        task1.resources.ports = 2;
        task1.resources.staticPorts = [8080,9001];
        task1.commandInfo.environment = [];
        offers.offers[0].resources[4] = {
                            "name": "portsa",
                            "role": "*",
                            "type": "RANGES",
                            "ranges": {
                                "range": [
                                    {
                                        "begin": 8080,
                                        "end": 8090
                                    },
                                    {
                                        "begin": 9000,
                                        "end": 9019
                                    }
                                ]
                            }
                        };

        var logger = helpers.getLogger(null, null, "debug");
        scheduler.pendingTasks = [task1];
        scheduler.launchedTasks = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {"frameworkName": "myfmw", "serialNumberedTasks": true};
        scheduler.options.staticPorts = true;
        handlers["OFFERS"].call(scheduler, offers);
        setTimeout(function () {
            expect(accept).to.equal(true);
            expect(scheduler.launchedTasks.length).to.equal(1);
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables).to.have.lengthOf(3);
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[0].name).to.equal("PORT0");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[0].value).to.equal("8080");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[1].name).to.equal("PORT1");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[1].value).to.equal("9001");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[2].name).to.equal("HOST");
            done();
        }, 500); //timeout with an error in one second
    });

    it("Recive an offer with no environment - static ports", function (done) {
        task1.resources.ports = 2;
        task1.resources.staticPorts = [8080,9001];
        task1.commandInfo.environment = [];

        var logger = helpers.getLogger(null, null, "debug");
        scheduler.pendingTasks = [task1];
        scheduler.launchedTasks = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {"frameworkName": "myfmw", "serialNumberedTasks": true};
        scheduler.options.staticPorts = true;
        handlers["OFFERS"].call(scheduler, offers);
        setTimeout(function () {
            expect(accept).to.equal(true);
            expect(scheduler.launchedTasks.length).to.equal(1);
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables).to.have.lengthOf(3);
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[0].name).to.equal("PORT0");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[0].value).to.equal("8080");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[1].name).to.equal("PORT1");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[1].value).to.equal("9001");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[2].name).to.equal("HOST");
            done();
        }, 500); //timeout with an error in one second
    });

    it("Recive an offer with no containerInfo - with lables - static ports", function (done) {
        task1.resources.ports = 2;
        task1.resources.staticPorts = [8080,9001];
        task1.commandInfo.environment = [];
        task1.containerInfo = undefined;
        task1.labels = new Mesos.Labels([new Mesos.Label("test1","data")]);

        var logger = helpers.getLogger(null, null, "debug");
        scheduler.pendingTasks = [task1];
        scheduler.launchedTasks = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {"frameworkName": "myfmw", "serialNumberedTasks": true};
        scheduler.options.staticPorts = true;
        handlers["OFFERS"].call(scheduler, offers);
        setTimeout(function () {
            expect(accept).to.equal(true);
            expect(scheduler.launchedTasks.length).to.equal(1);/*
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables).to.have.lengthOf(3);
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[0].name).to.equal("PORT0");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[0].value).to.equal("8080");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[1].name).to.equal("PORT1");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[1].value).to.equal("9001");
            expect(scheduler.launchedTasks[0].commandInfo.environment.variables[2].name).to.equal("HOST");*/
            done();
        }, 500); //timeout with an error in one second
    });

    it("Recive an offer with static ports of two ranges, decline", function (done) {

        task1.resources.ports = 2;
        task1.resources.staticPorts = [8181, 9100];

        var logger = helpers.getLogger(null, null, "debug");
        scheduler.pendingTasks = [task1];
        scheduler.launchedTasks = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {"frameworkName": "myfmw", "serialNumberedTasks": false};
        scheduler.options.staticPorts = true;
        handlers["OFFERS"].call(scheduler, offers);
        setTimeout(function () {
            expect(accept).to.equal(false);
            expect(scheduler.launchedTasks.length).to.equal(0);
            expect(scheduler.pendingTasks[0].commandInfo.environment.variables).to.have.lengthOf(1);
            done();
        }, 500); //timeout with an error in one second
    });

    it("Recive an offer with static ports of two ranges, decline below", function (done) {

        task1.resources.ports = 2;
        task1.resources.staticPorts = [8079, 8999];

        var logger = helpers.getLogger(null, null, "debug");
        scheduler.pendingTasks = [task1];
        scheduler.launchedTasks = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {"frameworkName": "myfmw", "serialNumberedTasks": false};
        scheduler.options.staticPorts = true;
        handlers["OFFERS"].call(scheduler, offers);
        setTimeout(function () {
            expect(accept).to.equal(false);
            expect(scheduler.launchedTasks.length).to.equal(0);
            expect(scheduler.pendingTasks[0].commandInfo.environment.variables).to.have.lengthOf(1);
            done();
        }, 500); //timeout with an error in one second
    });

    it("Recive an offer while suitable task with runtimeInfo is pending", function (done) {

        var runtimeInfo = {agentId: "12345"}
        task1.runtimeInfo = runtimeInfo;

        var logger = helpers.getLogger(null, null, "debug");

        scheduler.pendingTasks = [task1];
        scheduler.launchedTasks = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {"frameworkName": "myfmw", "serialNumberedTasks": true};
        //scheduler.staticPorts = [];

        handlers["OFFERS"].call(scheduler, offers);

        setTimeout(function () {
            expect(accept).to.equal(true);
            expect(scheduler.launchedTasks.length).to.equal(1);
            expect(scheduler.launchedTasks[0].runtimeInfo.agentId).to.equal("12325-23523-S23523");
            done();
        }, 500); //timeout with an error in one second
    });


    it("Recive an offer while unsuitable task is pending", function (done) {

        task1.resources.mem = 1028;

        var logger = helpers.getLogger(null, null, "debug");

        scheduler.pendingTasks = [task1];
        scheduler.launchedTasks = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {"frameworkName": "myfmw"}

        handlers["OFFERS"].call(scheduler, offers);

        setTimeout(function () {
            expect(accept).to.equal(false);
            expect(scheduler.pendingTasks[0].commandInfo.environment.variables).to.have.lengthOf(1);
            done();
        }, 500); //timeout with an error in one second
    });
});


describe("Update handlers tests", function () {

    var acknowleged;
    var killed;
    var runtimeInfo;
    var task1;
    var scheduler;

    function SchedulerStub() {
        // Inherit from EventEmitter
        EventEmitter.call(this);
        return this;
    };

    util.inherits(SchedulerStub, EventEmitter);

    beforeEach(function () {
        acknowleged = false;
        killed = false;
        runtimeInfo = {agentId: "12345", executorId: "5457"}
        task1 = {
            "name": "my-task",
            "taskId": "12344-my-task",
            "runtimeInfo": runtimeInfo,
            "commandInfo": new Mesos.CommandInfo(
                null, // URI
                new Mesos.Environment([
                    new Mesos.Environment.Variable("FOO", "BAR"),
                    new Mesos.Environment.Variable("PORT5053252", "BAR"),
                    new Mesos.Environment.Variable("PORT5", "BAR"),
                    new Mesos.Environment.Variable("PORT5HAFDSA", "BAR"),
                    new Mesos.Environment.Variable("1PORT3", "BAR"),
                    new Mesos.Environment.Variable("0HOST", "BAR"),
                    new Mesos.Environment.Variable("HOST1", "BAR"),
                    new Mesos.Environment.Variable("HOST", "BAR") // 3 Variables need to be removed when restarting a task, 5 should be left
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

        scheduler = new SchedulerStub();

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

        scheduler.kill = function (taskId, agentId) {
            killed = true
        };

    });





    it("Recive an update no uuid", function (done) {

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
        };

        handlers["UPDATE"].call(scheduler, update);
        setTimeout(function () {
            expect(acknowleged).to.equal(false);
            done();
        }, 500); //timeout with an error in one second

    });

    it("Recive an update with uuid and message", function (done) {

        var logger = helpers.getLogger(null, null, "debug");

        var update = {
            "status": {
                "task_id": {"value": "12344-my-task"},
                "state": "TASK_RUNNING",
                "source": "SOURCE_EXECUTOR",
                "bytes": "uhdjfhuagdj63d7hadkf",
                "uuid": "jhadf73jhakdlfha723adf",
                "message": "Update message from mesos"
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

    it("Recive an update for launched task to be killed - no restart", function (done) {

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

        scheduler.options.useZk = false;

        handlers["UPDATE"].call(scheduler, update);
        setTimeout(function () {
            expect(scheduler.launchedTasks.length).to.equal(0);
            done();
        }, 500); //timeout with an error in one second

    });

    it("Recive an update for launched task to be finished - no restart", function (done) {

        var logger = helpers.getLogger(null, null, "debug");

        var update = {
            "status": {
                "task_id": {"value": "12344-my-task"},
                "state": "TASK_FINISHED",
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
            "restartStates": ["TASK_FAILED", "TASK_LOST", "TASK_ERROR"]
        };

        scheduler.options.useZk = true;

        handlers["UPDATE"].call(scheduler, update);
        setTimeout(function () {
            expect(scheduler.launchedTasks.length).to.equal(0);
            done();
        }, 500); //timeout with an error in one second

    });

    it("Recive an update for launched task to be killed - restart", function (done) {

        var logger = helpers.getLogger(null, null, "debug");

        var update = {
            "status": {
                "task_id": {"value": "12344-my-task"},
                "state": "TASK_KILLED",
                "source": "SOURCE_EXECUTOR",
                "bytes": "uhdjfhuagdj63d7hadkf",
                "uuid": "jhadf73jhakdlfha723adf"/*,
                "executor_id": {"value": "12344-my-executor"},
                "agent_id": {"value": "12344-my-agent"}*/
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
            expect(scheduler.pendingTasks[0].commandInfo.environment.variables).to.have.lengthOf(5);
            done();
        }, 500); //timeout with an error in one second

    });

    it("Recive an update for launched task to be killed - restart and delete from zk - no environment", function (done) {

        var deleted = false;

        var logger = helpers.getLogger(null, null, "debug");

        var update = {
            "status": {
                "task_id": {"value": "12344-my-task"},
                "state": "TASK_KILLED",
                "source": "SOURCE_EXECUTOR",
                "bytes": "uhdjfhuagdj63d7hadkf",
                "uuid": "jhadf73jhakdlfha723adf"/*,
                "executor_id": {"value": "12344-my-executor"},
                "agent_id": {"value": "12344-my-agent"}*/
            }
        };

        scheduler.pendingTasks = [];
        scheduler.launchedTasks = [task1];
        task1.commandInfo.environment.variables = [];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {
            "frameworkName": "myfmw",
            "restartStates": ["TASK_FAILED", "TASK_KILLED", "TASK_LOST", "TASK_ERROR", "TASK_FINISHED"]
        };
        scheduler.options.useZk = true;
        scheduler.taskHelper = {};
        scheduler.taskHelper.deleteTask = function (task) {
            expect(deleted).to.be.false;
            deleted = true;
        };

        handlers["UPDATE"].call(scheduler, update);
        setTimeout(function () {
            expect(scheduler.pendingTasks.length).to.equal(1);
            expect(deleted).to.be.true;
            expect(scheduler.pendingTasks[0].commandInfo.environment.variables).to.have.lengthOf(0);
            done();
        }, 500); //timeout with an error in one second

    });

    it("Recive an update for launched task to be killed - restarting and delete from zk - restartStates", function (done) {

        var deleted = false;

        var logger = helpers.getLogger(null, null, "debug");

        var update = {
            "status": {
                "task_id": {"value": "12344-my-task"},
                "state": "TASK_KILLED",
                "source": "SOURCE_EXECUTOR",
                "bytes": "uhdjfhuagdj63d7hadkf",
                "uuid": "jhadf73jhakdlfha723adf"/*,
                "executor_id": {"value": "12344-my-executor"},
                "agent_id": {"value": "12344-my-agent"}*/
            }
        };

        scheduler.pendingTasks = [];
        scheduler.launchedTasks = [task1];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {
            "frameworkName": "myfmw",
            "restartStates": ["TASK_FAILED", "TASK_KILLED", "TASK_LOST", "TASK_ERROR", "TASK_FINISHED"]
        };
        scheduler.options.useZk = true;
        scheduler.taskHelper = {};
        scheduler.taskHelper.deleteTask = function (task) {
            expect(deleted).to.be.false;
            deleted = true;
        };

        task1.runtimeInfo.restarting = true;

        handlers["UPDATE"].call(scheduler, update);
        setTimeout(function () {
            expect(scheduler.pendingTasks.length).to.equal(0);
            expect(deleted).to.be.true;
            done();
        }, 500); //timeout with an error in one second

    });

    it("Recive an update for launched task to be killed - restarting without zk", function (done) {

        var deleted = false;

        var logger = helpers.getLogger(null, null, "debug");

        var update = {
            "status": {
                "task_id": {"value": "12344-my-task"},
                "state": "TASK_KILLED",
                "source": "SOURCE_EXECUTOR",
                "bytes": "uhdjfhuagdj63d7hadkf",
                "uuid": "jhadf73jhakdlfha723adf"/*,
                "executor_id": {"value": "12344-my-executor"},
                "agent_id": {"value": "12344-my-agent"}*/
            }
        };

        scheduler.pendingTasks = [];
        scheduler.launchedTasks = [task1, {"taskId": "124313-fdsf-fsa"}];
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {
            "frameworkName": "myfmw",
            "restartStates": ["TASK_FAILED", "TASK_KILLED", "TASK_LOST", "TASK_ERROR", "TASK_FINISHED"]
        };
        scheduler.options.useZk = false;

        task1.runtimeInfo.restarting = true;

        handlers["UPDATE"].call(scheduler, update);
        setTimeout(function () {
            expect(scheduler.pendingTasks.length).to.equal(0);
            expect(deleted).to.be.false;
            done();
        }, 500); //timeout with an error in one second

    });

    it("Recive an update for launched task is failed - no restart", function (done) {

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

    it("Recive an update for launched task is running", function (done) {

        var saved = false;

        var logger = helpers.getLogger(null, null, "debug");

        var update = {
            "status": {
                "task_id": {"value": "12344-my-task"},
                "state": "TASK_RUNNING",
                "source": "SOURCE_EXECUTOR",
                "bytes": "uhdjfhuagdj63d7hadkf",
                "uuid": "jhadf73jhakdlfha723adf",
                //"executor_id": {"value": "12344-my-executor"},
                "agent_id": {"value": "12344-my-agent"}
            }
        };

        scheduler.pendingTasks = [];
        scheduler.launchedTasks = [task1];
        task1.runtimeInfo.state = "TASK_STAGING";
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {
            "frameworkName": "myfmw",
            "restartStates": ["TASK_KILLED", "TASK_LOST", "TASK_ERROR", "TASK_FINISHED"]
        };
        scheduler.options.useZk = true;
        scheduler.taskHelper = {};
        scheduler.taskHelper.saveTask = function (task) {
            expect(saved).to.be.false;
            saved = true;
        };

        handlers["UPDATE"].call(scheduler, update);
        setTimeout(function () {
            expect(saved).to.be.true;
            expect(scheduler.launchedTasks[0].runtimeInfo.state).to.equal("TASK_RUNNING");
            expect(scheduler.launchedTasks[0].runtimeInfo.startTime).to.be.above(1484200000000);
            done();
        }, 500); //timeout with an error in one second

    });

    it("Recive an update for launched task is running - different info available", function (done) {

        var saved = false;

        var logger = helpers.getLogger(null, null, "debug");

        var update = {
            "status": {
                "task_id": {"value": "12344-my-task"},
                "state": "TASK_RUNNING",
                "source": "SOURCE_EXECUTOR",
                "bytes": "uhdjfhuagdj63d7hadkf",
                "uuid": "jhadf73jhakdlfha723adf",
                //"executor_id": {"value": "12344-my-executor"},
                "agent_id": {"value": "12344-my-agent"}
            }
        };

        scheduler.pendingTasks = [];
        scheduler.launchedTasks = [task1];
        task1.runtimeInfo.state = "TASK_STAGING";
        var originalStartTime = Date.now();
        task1.runtimeInfo.startTime = originalStartTime;
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {
            "frameworkName": "myfmw",
            "restartStates": ["TASK_KILLED", "TASK_LOST", "TASK_ERROR", "TASK_FINISHED"]
        };
        scheduler.options.useZk = true;
        scheduler.taskHelper = {};
        scheduler.taskHelper.saveTask = function (task) {
            expect(saved).to.be.false;
            saved = true;
        };

        handlers["UPDATE"].call(scheduler, update);
        setTimeout(function () {
            expect(saved).to.be.true;
            expect(scheduler.launchedTasks[0].runtimeInfo.state).to.equal("TASK_RUNNING");
            expect(scheduler.launchedTasks[0].runtimeInfo.startTime).to.equal(originalStartTime);
            done();
        }, 500); //timeout with an error in one second

    });

    it("Recive an update for launched task is running - no runtimeInfo available", function (done) {

        var saved = false;

        var logger = helpers.getLogger(null, null, "debug");

        var update = {
            "status": {
                "task_id": {"value": "12344-my-task"},
                "state": "TASK_RUNNING",
                "source": "SOURCE_EXECUTOR",
                "bytes": "uhdjfhuagdj63d7hadkf",
                "uuid": "jhadf73jhakdlfha723adf",
                "executor_id": {"value": "12344-my-executor"},
                "agent_id": {"value": "12344-my-agent"}
            }
        };

        scheduler.pendingTasks = [];
        scheduler.launchedTasks = [task1];
        task1.runtimeInfo = {};
        scheduler.logger = logger;
        scheduler.frameworkId = "12124-235325-32425";
        scheduler.options = {
            "frameworkName": "myfmw",
            "restartStates": ["TASK_KILLED", "TASK_LOST", "TASK_ERROR", "TASK_FINISHED"]
        };
        scheduler.options.useZk = true;
        scheduler.taskHelper = {};
        scheduler.taskHelper.saveTask = function (task) {
            expect(saved).to.be.false;
            saved = true;
        };

        handlers["UPDATE"].call(scheduler, update);
        setTimeout(function () {
            expect(saved).to.be.true;
            expect(scheduler.launchedTasks[0].runtimeInfo.state).to.equal("TASK_RUNNING");
            expect(scheduler.launchedTasks[0].runtimeInfo.startTime).to.be.above(1484200000000);
            done();
        }, 500); //timeout with an error in one second

    });

    it("Recive an update after reconciliation - no delete", function (done) {

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

    it("Recive an update after reconciliation - (no kill unknown tasks) cleanup from zookeeper", function (done) {

        var deleted = false;

        var logger = helpers.getLogger(null, null, "debug");

        var update = {
            "status": {
                "task_id": {"value": "12345-my-task"},
                "state": "TASK_FAILED",
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
        scheduler.options.useZk = true;
        scheduler.taskHelper = {};
        scheduler.taskHelper.deleteTask = function (task) {
            expect(deleted).to.be.false;
            deleted = true;
        };

        scheduler.options.killUnknownTasks = false;

        handlers["UPDATE"].call(scheduler, update);
        setTimeout(function () {
            expect(killed).to.equal(false);
            expect(deleted).to.be.true;
            done();
        }, 500); //timeout with an error in one second

    });

    it("Recive an update after reconciliation - delete", function (done) {

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

