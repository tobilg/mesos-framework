"use strict";

// Global
var util = require("util");
var EventEmitter = require("events").EventEmitter;

// Project require
var lib = require("requirefrom")("lib");
var Scheduler = require("../index").Scheduler;
var helpers = lib("helpers");
var TaskHelper = lib("taskHelper");
var Builder = lib("builder");
var Mesos = lib("mesos")().getMesos();

// Lib require for stubs
var zookeeper = require("node-zookeeper-client");

// Testing require
var expect = require("chai").expect;
var sinon = require("sinon");

describe("Task helper constructor", function () {
    it("Create TaskHelper based on scheduler instance", function () {
        var scheduler = Scheduler({});
        expect(scheduler).to.be.instanceOf(Scheduler);
        var taskHelper = TaskHelper(scheduler);
        expect(taskHelper.scheduler).to.be.instanceOf(Scheduler);
        expect(taskHelper.scheduler).to.deep.equal(scheduler);
    });

});
describe("Load tasks from Zk:", function () {

    var zkClient = zookeeper.createClient("127.0.0.1");
    var eventFired = false;
    var sandbox;

    function SchedulerStub() {
        // Inherit from EventEmitter
        EventEmitter.call(this);
        return this;
    }

    util.inherits(SchedulerStub, EventEmitter);

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
        sandbox.stub(zkClient, "connect", function () {
            this.emit("connected");
        });
        sandbox.stub(zkClient, "getChildren", function (path, cb) {
            cb(zookeeper.Exception.create(zookeeper.Exception.CONNECTION_LOSS), null, 1);
        });

        eventFired = false;
    });
    afterEach(function (done) {
        sandbox.restore();
        done();
    });
    it("ZK is down while getting children", function (done) {
        var logger = helpers.getLogger(null, null, "debug");
        var schedulerStub = new SchedulerStub();

        schedulerStub.on("ready", function () {
            eventFired = true;
        });

        var taskHelper = new TaskHelper({
            "zkClient": zkClient,
            "logger": logger,
            "pendingTasks": [],
            "launchedTasks": []
        });
        taskHelper.scheduler = schedulerStub;

        taskHelper.loadTasks();

        setTimeout(function () {
            done();
        }, 100); //timeout with an error in one second

        expect(eventFired).to.equal(true);
    });
    it("ZK is down while getting data", function (done) {

        zkClient.getChildren.restore();
        sandbox.stub(zkClient, "getChildren", function (path, cb) {
            cb(null, ["one", "two"], 1);
        });


        sandbox.stub(zkClient, "getData", function (path, cb) {
            cb(zookeeper.Exception.create(zookeeper.Exception.NO_NODE), null, 1);
        });

        var logger = helpers.getLogger(null, null, "debug");
        var schedulerStub = new SchedulerStub();

        schedulerStub.on("ready", function () {
            eventFired = true;
        });

        var taskHelper = new TaskHelper({
            "zkClient": zkClient,
            "logger": logger,
            "pendingTasks": [],
            "launchedTasks": []
        });
        taskHelper.scheduler = schedulerStub;

        taskHelper.loadTasks();

        setTimeout(function () {
            done();
        }, 100); //timeout with an error in one second

        expect(eventFired).to.equal(true);
    });
    it("Succeed to load tasks but not found in pending (should kill)", function (done) {

        zkClient.getChildren.restore();

        sandbox.stub(zkClient, "getChildren", function (path, cb) {
            cb(null, ["one", "two"], 1);
        });

        // The container information object to be used
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

        var task1 = "{\"name\": \"task1\",\"taskId\": 1}";
        var task2 = "{\"name\": \"task2\",\"taskId\": 2}";

        sandbox.stub(zkClient, "getData", function (path, cb) {
            if (path.includes("one")) {
                cb(null, task1, 1);
            } else {
                cb(null, task2, 1);
            }
        });

        var logger = helpers.getLogger(null, null, "debug");
        var schedulerStub = new SchedulerStub();

        schedulerStub.pendingTasks = [];
        schedulerStub.killTasks = [];

        schedulerStub.on("ready", function () {
            eventFired = true;
        });

        var taskHelper = new TaskHelper({
            "zkClient": zkClient,
            "logger": logger,
            "pendingTasks": [],
            "launchedTasks": []
        });
        taskHelper.scheduler = schedulerStub;

        taskHelper.loadTasks();

        setTimeout(function () {
            done();
        }, 100); //timeout with an error in one second

        expect(eventFired).to.equal(true);

        // check that tasks were killed
        expect(schedulerStub.killTasks.length).to.equal(2);
    });
    it("Succeed to load tasks and found in pending (should restore)", function (done) {
        var deleted = false;
        zkClient.getChildren.restore();
        sandbox.stub(zkClient, "getChildren", function (path, cb) {
            cb(null, ["one", "two", "three"], 1);
        });

        var task1 = {name: "/task1", taskId: "1", runtimeInfo: {agentId: "12345", state: "TASK_RUNNING"}};
        var task2 = {name: "/task2", taskId: "2", runtimeInfo: {agentId: "12346", state: "TASK_RUNNING"}};
        var task3 = {name: "/task3", taskId: "3", runtimeInfo: {agentId: "12446", state: "TASK_FINISHED"}};

        sandbox.stub(zkClient, "getData", function (path, cb) {
            if (path.includes("one")) {
                cb(null, JSON.stringify(task1), 1);
            } else if (path.includes("two")) {
                cb(null, JSON.stringify(task2), 1);
            } else {
                cb(null, JSON.stringify(task3), 1);
            }
        });

        sandbox.stub(zkClient, "remove", function (path, cb) {
            cb(null, null);
            deleted = true;
        });
        var logger = helpers.getLogger(null, null, "info");
        var schedulerStub = new SchedulerStub();

        schedulerStub.pendingTasks = [task1, task2, task3];
        schedulerStub.killTasks = [];
        schedulerStub.launchedTasks = [];
        schedulerStub.reconcileTasks = [];

        schedulerStub.on("ready", function () {
            eventFired = true;
        });

        var taskHelper = new TaskHelper({
            "zkClient": zkClient,
            "logger": logger,
            "pendingTasks": [],
            "launchedTasks": []
        });
        taskHelper.scheduler = schedulerStub;

        taskHelper.loadTasks();

        setTimeout(function () {
            done();
        }, 100); //timeout with an error in one second

        expect(eventFired).to.equal(true);
        expect(deleted).to.be.true;

        // check that tasks were killed
        expect(schedulerStub.killTasks.length).to.equal(0);
        expect(schedulerStub.launchedTasks.length).to.equal(2);
        expect(schedulerStub.reconcileTasks.length).to.equal(2);
    });
    it("Succeed to load tasks with environment and found in pending (should restore)", function (done) {
        var deleted = false;
        zkClient.getChildren.restore();
        sandbox.stub(zkClient, "getChildren", function (path, cb) {
            cb(null, ["one", "two", "three"], 1);
        });

        var task1 = {
            name: "/task1", taskId: "1",
            "commandInfo": new Mesos.CommandInfo(
                null, // URI
                new Mesos.Environment([
                    new Builder("mesos.Environment.Variable").setName("FOO").setValue("BAR"),
                    new Builder("mesos.Environment.Variable").setName("HOST").setValue("214214.1244.412421"),
                    new Builder("mesos.Environment.Variable").setName("PORT0").setValue("3232")
                ]), // Environment
                false, // Is shell?
                null, // Command
                null, // Arguments
                null // User
            ),
            runtimeInfo: {agentId: "12345", state: "TASK_RUNNING"}};
        var task2 = {name: "/task2", taskId: "2",
            "commandInfo": new Mesos.CommandInfo(
                null, // URI
                new Mesos.Environment([
                    new Builder("mesos.Environment.Variable").setName("FOO").setValue("BAR"),
                    new Builder("mesos.Environment.Variable").setName("HOST").setValue("214214.1244.412421"),
                    new Builder("mesos.Environment.Variable").setName("PORT0").setValue("3232")
                ]), // Environment
                false, // Is shell?
                null, // Command
                null, // Arguments
                null // User
            ),
            runtimeInfo: {agentId: "12346", state: "TASK_RUNNING"}};
        var task3 = {name: "/task3", taskId: "3", runtimeInfo: {agentId: "12446", state: "TASK_FINISHED"}};

        sandbox.stub(zkClient, "getData", function (path, cb) {
            if (path.includes("one")) {
                cb(null, JSON.stringify(task1), 1);
            } else if (path.includes("two")) {
                cb(null, JSON.stringify(task2), 1);
            } else {
                cb(null, JSON.stringify(task3), 1);
            }
        });

        sandbox.stub(zkClient, "remove", function (path, cb) {
            cb(null, null);
            deleted = true;
        });
        var logger = helpers.getLogger(null, null, "info");
        var schedulerStub = new SchedulerStub();

        schedulerStub.pendingTasks = [task1, task2, task3];
        schedulerStub.killTasks = [];
        schedulerStub.launchedTasks = [];
        schedulerStub.reconcileTasks = [];

        schedulerStub.on("ready", function () {
            eventFired = true;
        });

        var taskHelper = new TaskHelper({
            "zkClient": zkClient,
            "logger": logger,
            "pendingTasks": [],
            "launchedTasks": []
        });
        taskHelper.scheduler = schedulerStub;

        taskHelper.loadTasks();

        setTimeout(function () {
            done();
        }, 100); //timeout with an error in one second

        expect(eventFired).to.equal(true);
        expect(deleted).to.be.true;

        // check that tasks were killed
        expect(schedulerStub.killTasks.length).to.equal(0);
        expect(schedulerStub.launchedTasks.length).to.equal(2);
        expect(schedulerStub.reconcileTasks.length).to.equal(2);
    });
    it("Succeed to load tasks with partial environment and found in pending (should restore)", function (done) {
        var deleted = false;
        zkClient.getChildren.restore();
        sandbox.stub(zkClient, "getChildren", function (path, cb) {
            cb(null, ["one", "two", "three"], 1);
        });

        var task1p = {
            name: "/task1", taskId: "1",
            "commandInfo": new Mesos.CommandInfo(
                null, // URI
                null, // Environment
                false, // Is shell?
                null, // Command
                null, // Arguments
                null // User
            ),
            runtimeInfo: {agentId: "12345", state: "TASK_RUNNING"}};
        var task2p = {name: "/task2", taskId: "2",
            "commandInfo": null,
            runtimeInfo: {agentId: "12346", state: "TASK_RUNNING"}};
        var task1 = {
            name: "/task1", taskId: "1",
            "commandInfo": new Mesos.CommandInfo(
                null, // URI
                new Mesos.Environment([
                    new Builder("mesos.Environment.Variable").setName("FOO").setValue("BAR"),
                    new Builder("mesos.Environment.Variable").setName("HOST").setValue("214214.1244.412421"),
                    new Builder("mesos.Environment.Variable").setName("PORT0").setValue("3232")
                ]), // Environment
                false, // Is shell?
                null, // Command
                null, // Arguments
                null // User
            ),
            runtimeInfo: {agentId: "12345", state: "TASK_RUNNING"}};
        var task2 = {name: "/task2", taskId: "2",
            "commandInfo": new Mesos.CommandInfo(
                null, // URI
                new Mesos.Environment([
                    new Builder("mesos.Environment.Variable").setName("FOO").setValue("BAR"),
                    new Builder("mesos.Environment.Variable").setName("HOST").setValue("214214.1244.412421"),
                    new Builder("mesos.Environment.Variable").setName("PORT0").setValue("3232")
                ]), // Environment
                false, // Is shell?
                null, // Command
                null, // Arguments
                null // User
            ),
            runtimeInfo: {agentId: "12346", state: "TASK_RUNNING"}};
        var task3 = {name: "/task3", taskId: "3", runtimeInfo: {agentId: "12446", state: "TASK_FINISHED"}};

        sandbox.stub(zkClient, "getData", function (path, cb) {
            if (path.includes("one")) {
                cb(null, JSON.stringify(task1), 1);
            } else if (path.includes("two")) {
                cb(null, JSON.stringify(task2), 1);
            } else {
                cb(null, JSON.stringify(task3), 1);
            }
        });

        sandbox.stub(zkClient, "remove", function (path, cb) {
            cb(null, null);
            deleted = true;
        });
        var logger = helpers.getLogger(null, null, "info");
        var schedulerStub = new SchedulerStub();

        schedulerStub.pendingTasks = [task1p, task2p, task3];
        schedulerStub.killTasks = [];
        schedulerStub.launchedTasks = [];
        schedulerStub.reconcileTasks = [];

        schedulerStub.on("ready", function () {
            eventFired = true;
        });

        var taskHelper = new TaskHelper({
            "zkClient": zkClient,
            "logger": logger,
            "pendingTasks": [],
            "launchedTasks": []
        });
        taskHelper.scheduler = schedulerStub;

        taskHelper.loadTasks();

        setTimeout(function () {
            done();
        }, 100); //timeout with an error in one second

        expect(eventFired).to.equal(true);
        expect(deleted).to.be.true;

        // check that tasks were killed
        expect(schedulerStub.killTasks.length).to.equal(0);
        expect(schedulerStub.launchedTasks.length).to.equal(2);
        expect(schedulerStub.reconcileTasks.length).to.equal(2);
    });
    it("Succeed to load task list but fail to load task", function (done) {
        zkClient.getChildren.restore();
        sandbox.stub(zkClient, "getChildren", function (path, cb) {
            cb(null, ["one", "two"], 1);
        });

        var deleted = false;
        var task1 = {name: "/task1", taskId: "1", runtimeInfo: {agentId: "12345", state: "TASK_RUNNING"}};
        var task2 = {name: "/task2", taskId: "2", runtimeInfo: {agentId: "12346", state: "TASK_RUNNING"}};

        sandbox.stub(zkClient, "getData", function (path, cb) {
            if (path.includes("one")) {
                cb(null, JSON.stringify(task1), 1);
            } else {
                cb(null, null, 1);
            }
        });
        sandbox.stub(zkClient, "remove", function (path, cb) {
            cb(null, null);
            deleted = true;
        });

        var logger = helpers.getLogger(null, null, "info");
        var schedulerStub = new SchedulerStub();

        schedulerStub.pendingTasks = [task1, task2];
        schedulerStub.killTasks = [];
        schedulerStub.launchedTasks = [];
        schedulerStub.reconcileTasks = [];

        schedulerStub.on("ready", function () {
            eventFired = true;
        });

        var taskHelper = new TaskHelper({
            "zkClient": zkClient,
            "logger": logger,
            "pendingTasks": [],
            "launchedTasks": []
        });
        taskHelper.scheduler = schedulerStub;

        taskHelper.loadTasks();

        setTimeout(function () {
            expect(deleted).to.be.true;
            done();
        }, 100); //timeout with an error in one second

        expect(eventFired).to.equal(true);

        // check that tasks were killed
        expect(schedulerStub.killTasks.length).to.equal(0);
        expect(schedulerStub.launchedTasks.length).to.equal(1);
        expect(schedulerStub.reconcileTasks.length).to.equal(1);
    });
    it("Succeed to load tasks and no tasks", function (done) {
        zkClient.getChildren.restore();
        sandbox.stub(zkClient, "getChildren", function (path, cb) {
            cb(null, [], 1);
        });

        var task1 = {name: "/task1", taskId: "1", runtimeInfo: {agentId: "12345"}};
        var task2 = {name: "/task2", taskId: "2", runtimeInfo: {agentId: "12346"}};

        sandbox.stub(zkClient, "getData", function (path, cb) {
            if (path.includes("one")) {
                cb(null, JSON.stringify(task1), 1);
            } else {
                cb(null, JSON.stringify(task2), 1);
            }
        });

        var logger = helpers.getLogger(null, null, "info");
        var schedulerStub = new SchedulerStub();

        schedulerStub.pendingTasks = [task1, task2];
        schedulerStub.killTasks = [];
        schedulerStub.launchedTasks = [];
        schedulerStub.reconcileTasks = [];

        schedulerStub.on("ready", function () {
            eventFired = true;
        });

        var taskHelper = new TaskHelper({
            "zkClient": zkClient,
            "logger": logger,
            "pendingTasks": [],
            "launchedTasks": []
        });
        taskHelper.scheduler = schedulerStub;

        taskHelper.loadTasks();

        setTimeout(function () {
            done();
        }, 100); //timeout with an error in one second

        expect(eventFired).to.equal(true);

        // check that tasks were killed
        expect(schedulerStub.killTasks.length).to.equal(0);
        expect(schedulerStub.launchedTasks.length).to.equal(0);
        expect(schedulerStub.reconcileTasks.length).to.equal(0);
    });
    it("Succeed to load tasks and found in pending but no runtimeInfo (should delete from zk)", function (done) {

        zkClient.getChildren.restore();

        sandbox.stub(zkClient, "getChildren", function (path, cb) {
            cb(null, ["/one", "/two"], 1);
        });

        var task1 = {name: "/task1", taskId: "1"};
        var task2 = {name: "/task2", taskId: "2"};

        sandbox.stub(zkClient, "getData", function (path, cb) {
            if (path.includes("one")) {
                cb(null, JSON.stringify(task1), 1);
            } else {
                cb(null, JSON.stringify(task2), 1);
            }
        });

        sandbox.stub(zkClient, "remove", function (path, cb) {
            cb(null, null);
        });

        var logger = helpers.getLogger(null, null, "info");
        var schedulerStub = new SchedulerStub();

        schedulerStub.pendingTasks = [task1, task2];
        schedulerStub.killTasks = [];
        schedulerStub.launchedTasks = [];
        schedulerStub.reconcileTasks = [];

        schedulerStub.on("ready", function () {
            eventFired = true;
        });

        var taskHelper = new TaskHelper({
            "zkClient": zkClient,
            "logger": logger,
            "pendingTasks": [],
            "launchedTasks": []
        });
        taskHelper.scheduler = schedulerStub;

        taskHelper.loadTasks();

        setTimeout(function () {
            done();
        }, 100); //timeout with an error in one second

        expect(eventFired).to.equal(true);

        // check that tasks were killed
        expect(schedulerStub.killTasks.length).to.equal(0);
        expect(schedulerStub.launchedTasks.length).to.equal(0);
        expect(schedulerStub.reconcileTasks.length).to.equal(0);
    });
});

describe("Delete task:", function () {
    var sandbox;
    var zkClient = zookeeper.createClient("127.0.0.1");
    before(function () {
        sandbox = sinon.sandbox.create();
        sandbox.stub(zkClient, "connect", function () {
            this.emit("connected");
        });
    });
    after(function (done) {
        sandbox.restore();
        done();
    });

    it("Succeeds", function () {
        var logger = helpers.getLogger(null, null, "error");
        var logspy = sinon.spy(logger, "debug");

        sandbox.stub(zkClient, "remove", function (path, cb) {
            cb(null, null);
        });

        var taskHelper = new TaskHelper({
            "zkClient": zkClient,
            "logger": logger,
            "pendingTasks": [],
            "launchedTasks": []
        });

        taskHelper.deleteTask("dummytask");
        sinon.assert.calledOnce(logspy);
    });

    it("ZK is down while trying to remove task", function () {

        var logger = helpers.getLogger(null, null, "error");
        var logspy = sinon.spy(logger, "error");

        zkClient.remove.restore();
        sandbox.stub(zkClient, "remove", function (path, cb) {
            cb(zookeeper.Exception.create(zookeeper.Exception.CONNECTION_LOSS), null);
        });

        var taskHelper = new TaskHelper({
            "zkClient": zkClient,
            "logger": logger,
            "pendingTasks": [],
            "launchedTasks": []
        });

        taskHelper.deleteTask("dummytask");
        sinon.assert.calledOnce(logspy);
    });

});

describe("Save task:", function () {
    var sandbox;
    var zkClient = zookeeper.createClient("127.0.0.1");
    before(function () {
        sandbox = sinon.sandbox.create();
        sandbox.stub(zkClient, "connect", function () {
            this.emit("connected");
        });
    });
    after(function (done) {
        sandbox.restore();
        done();
    });

    it("ZK create dir fails", function () {

        sandbox.stub(zkClient, "mkdirp", function (path, cb) {
            cb(zookeeper.Exception.create(zookeeper.Exception.CONNECTION_LOSS), null);
        });

        var logger = helpers.getLogger(null, null, "error");
        var logspy = sinon.spy(logger, "error");

        var taskHelper = new TaskHelper({
            "zkClient": zkClient,
            "logger": logger,
            "pendingTasks": [],
            "launchedTasks": []
        });

        taskHelper.saveTask("dummytask")
        sinon.assert.calledOnce(logspy);
    });

    it("ZK save data fails", function () {

        var logger = helpers.getLogger(null, null, "error");
        var logspy = sinon.spy(logger, "error");

        zkClient.mkdirp.restore();

        sandbox.stub(zkClient, "mkdirp", function (path, cb) {
            cb(null, null);
        });

        sandbox.stub(zkClient, "setData", function (path, data, cb) {
            cb(zookeeper.Exception.create(zookeeper.Exception.CONNECTION_LOSS), null);
        });

        var taskHelper = new TaskHelper({
            "zkClient": zkClient,
            "logger": logger,
            "pendingTasks": [],
            "launchedTasks": []
        });

        taskHelper.saveTask("dummytask")
        sinon.assert.calledOnce(logspy);
    });

    it("Succeeds", function () {

        var logger = helpers.getLogger(null, null, "error");
        var debugSpy = sinon.spy(logger, "debug");
        var errSpy = sinon.spy(logger, "error");

        zkClient.mkdirp.restore();
        zkClient.setData.restore();

        sandbox.stub(zkClient, "mkdirp", function (path, cb) {
            cb(null, null);
        });

        sandbox.stub(zkClient, "setData", function (path, data, cb) {
            cb(null, null);
        });

        var taskHelper = new TaskHelper({
            "zkClient": zkClient,
            "logger": logger,
            "pendingTasks": [],
            "launchedTasks": []
        });

        taskHelper.saveTask("dummytask")
        sinon.assert.calledOnce(debugSpy);
        sinon.assert.notCalled(errSpy);
    });

});

