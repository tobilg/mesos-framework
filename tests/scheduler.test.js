// Project require
var Scheduler = require("../").Scheduler;
var helpers = require("../lib/helpers");
var TaskHelper = require("../lib/taskHelper");
var winston = require('winston');

// Lib require for stubs
var zookeeper = require("node-zookeeper-client");

// Testing require
var expect = require('chai').expect;
var sinon = require("sinon");

describe('Scheduler constructor', function() {
    var sandbox;
    it('Create the Scheduler with default options', function () {
        var scheduler = Scheduler({});
        expect(scheduler).to.be.instanceOf(Scheduler);
        expect(scheduler.tasks).to.be.an('array');
    });
    it('Create the Scheduler with a task', function () {
        var scheduler = Scheduler({tasks: {task1:{}}});
        expect(scheduler).to.be.instanceOf(Scheduler);
        expect(scheduler.tasks).to.be.an('array');
        expect(scheduler.tasks).to.have.lengthOf(1);
    });
    it.skip('Create the Scheduler with a submitted task', function () {
        var scheduler = Scheduler({tasks: {task1:{isSubmitted:true}}});
        expect(scheduler).to.be.instanceOf(Scheduler);
        expect(scheduler.tasks).to.be.an('array');
        expect(scheduler.tasks).to.have.lengthOf(1);
        expect(scheduler.pendingTasks).to.have.lengthOf(0);
    });
    it('Create the Scheduler with 2 submitted tasks (sort test)', function () {
        var scheduler = Scheduler({tasks: {
                task1:{isSubmitted:true},
                task2:{isSubmitted:true}
            }});
        expect(scheduler).to.be.instanceOf(Scheduler);
        expect(scheduler.tasks).to.be.an('array');
        expect(scheduler.tasks).to.have.lengthOf(2);
    });
    it('Create the Scheduler with 3 submitted tasks with priority (sort test)', function () {
        var scheduler = Scheduler({tasks: {
                task1:{isSubmitted:true, priority:1},
                task2:{isSubmitted:true, priority:2},
                task3:{isSubmitted:true, priority:1}
            }});
        expect(scheduler).to.be.instanceOf(Scheduler);
        expect(scheduler.tasks).to.be.an('array');
        expect(scheduler.tasks).to.have.lengthOf(3);
    });
    it('Create the Scheduler with 3 submitted tasks with priority and multiple instances (sort test)', function () {
        var scheduler = Scheduler({tasks: {
                task1:{isSubmitted:true, priority:1},
                task2:{isSubmitted:true, priority:2},
                task3:{isSubmitted:true, priority:1, instances:2}
            }});
        expect(scheduler).to.be.instanceOf(Scheduler);
        expect(scheduler.tasks).to.be.an('array');
        expect(scheduler.tasks).to.have.lengthOf(4);
    });
    describe("Create scheduler with an already submitted task", function () {
        before(function () {
            sandbox = sinon.sandbox.create();
            sandbox.stub(helpers, "sortTasksByPriority", function(tasks) {
                return [{name:"task1", isSubmitted:true},
                    {name:"task2", isSubmitted:true,instances:3}];
            });
        });
        after(function (done) {
            sandbox.restore();
            done();
        });
        it("The actual test", function () {
            var scheduler = Scheduler({tasks: {
                    task1:{isSubmitted:true}
                }});

            expect(scheduler).to.be.instanceOf(Scheduler);
            expect(scheduler.tasks).to.be.an('array');
            expect(scheduler.tasks).to.have.lengthOf(2);
            expect(scheduler.pendingTasks).to.have.lengthOf(0);
        });
    });
    describe("Create scheduler with ZK", function () {
        var zkClient = zookeeper.createClient("127.0.0.1");
        var logger = helpers.getLogger(null, null, "debug");
        var taskHelper = new TaskHelper({"zkClient": zkClient, "logger": logger, "pendingTasks":[], "launchedTasks":[], scheduler:{}})
        before(function () {
            sandbox = sinon.sandbox.create();

            //sandbox.stub(zookeeper, "createClient" );
            /*sandbox.stub(zookeeper, "on", function(event, cb) {
                if (event == "connected") {
                    cb();
                }
            });*/
            sandbox.stub(zkClient, "connect", function() {
                this.emit("connected");
            });
            sandbox.stub(zkClient, "getData", function(path,watch,cb) {
                cb(null, "434e8173-45ea-435e-905e-d577b260898c-1021", 1);
            });
            sandbox.stub(taskHelper, "loadTasks", function() {
                var self = this;
                setTimeout(function() {
                    self.scheduler.emit("ready");
                }, 100);
            });

        });
        after(function (done) {
            sandbox.restore();
            done();
        });
        it("Success path", function (done) {
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: true, logging: {level: "debug"}, zkClient: zkClient, taskHelper: taskHelper});
            scheduler.on("ready", function() {
                done();
            });
        });
        it("Read no node error path", function (done) {
            zkClient.getData.restore();
            sandbox.stub(zkClient, "getData", function(path,watch,cb) {
                setTimeout(function() {
                    cb(zookeeper.Exception.create(zookeeper.Exception.NO_NODE), null, 1);
                }, 100);
            });
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: true, logging: {level: "debug"}, zkClient: zkClient, taskHelper: taskHelper});
            scheduler.on("ready", function() {
                done();
            });
        });
        it("Read other error path", function (done) {
            var isReady = false;
            zkClient.getData.restore();
            sandbox.stub(zkClient, "getData", function(path,watch,cb) {
                setTimeout(function() {
                    cb(zookeeper.Exception.create(zookeeper.Exception.CONNECTION_LOSS), null, 1);
                    //cb(null, "434e8173-45ea-435e-905e-d577b260898c-2021", 1);
                }, 100);
            });
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: true, logging: {level: "debug"}, zkClient: zkClient, taskHelper: taskHelper});
            scheduler.on("ready", function() {
                isReady = true;
                console.log("got to ready");
                expect(true).to.be.false;
            });
            setTimeout(function () {
                expect(isReady).to.be.false;
                done();
            }, 400);
        });
        it("Read zk OOB error", function (done) {
            var isReady = false;
            zkClient.getData.restore();
            sandbox.stub(zkClient, "getData", function(path,watch,cb) {
                var self = this;
                setTimeout(function() {
                    var err = zookeeper.Exception.create(zookeeper.Exception.CONNECTION_LOSS);
                    self.emit("error", err)
                    cb(err, null, 1);
                }, 100);
            });
            var scheduler = Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: true, logging: {level: "debug"}, zkClient: zkClient, taskHelper: taskHelper});
            scheduler.on("ready", function() {
                isReady = true;
                console.log("got to ready");
                expect(true).to.be.false;
            });
            setTimeout(function () {
                expect(isReady).to.be.false;
                done();
            }, 400);
        });
        it("Read null data", function (done) {
            var isReady = false;
            zkClient.getData.restore();
            sandbox.stub(zkClient, "getData", function(path,watch,cb) {
                setTimeout(function() {
                    cb(null, null, 1);
                }, 100);
            });
            var scheduler = Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: true, logging: {level: "debug"}, zkClient: zkClient, taskHelper: taskHelper});
            scheduler.on("ready", function() {
                isReady = true;
                console.log("got to ready");
                done();
            });
            setTimeout(function () {
                expect(isReady).to.be.false;
                done();
            }, 400);
        });
        it("Read null data without helper", function (done) {
            var isReady = false;
            zkClient.getData.restore();
            sandbox.stub(zkClient, "getData", function(path,watch,cb) {
                setTimeout(function() {
                    cb(null, null, 1);
                }, 100);
            });
            var scheduler = Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: true, logging: {level: "debug"}, zkClient: zkClient});
            scheduler.on("ready", function() {
                isReady = true;
                console.log("got to ready");
                done();
            });
            setTimeout(function () {
                expect(isReady).to.be.false;
                done();
            }, 400);
        });
        it("Connect fail", function (done) {
            var isReady = false;
            zkClient.getData.restore();
            sandbox.stub(zkClient, "getData", function(path,watch,cb) {
                setTimeout(function() {
                    cb(null, null, 1);
                }, 100);
            });
            var scheduler = Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: true, logging: {level: "debug"}});
            scheduler.on("ready", function() {
                isReady = true;
                console.log("got to ready");
                done();
            });
            setTimeout(function () {
                expect(isReady).to.be.false;
                done();
            }, 400);
        });
        it("Custom handler - no case mixing", function (done) {
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}, handlers: {"SUBSCRIBED": function (type) {}}});
            scheduler.on("ready", function() {
                console.log("Function length: " + (function (type) {}).length.toString());
                expect(Object.keys(scheduler.customEventHandlers)).not.to.have.lengthOf(0);
                done();
            });
        });
        it("Custom handler - case mixing", function (done) {
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}, handlers: {"subSCRIBED": function (type) {}}});
            scheduler.on("ready", function() {
                console.log("Function length: " + (function (type) {}).length.toString());
                expect(Object.keys(scheduler.customEventHandlers)).not.to.have.lengthOf(0);
                done();
            });
        });
        it("Custom bad handlers (ignored)", function (done) {
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}, handlers: {"test":"test"}});
            scheduler.on("ready", function() {
                expect(Object.keys(scheduler.customEventHandlers)).to.have.lengthOf(0);
                done();
            });
        });
    });
    describe("Request functions", function() {
        beforeEach(function() {
            this.request = sinon.stub(helpers, "doRequest");
        });
        afterEach(function() {
            helpers.doRequest.restore();
        });
        it("kill Success", function(done) {
            this.request.callsArgWith(1, null);
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("ready", function() {
                scheduler.kill("1234","12345");
            });
            scheduler.on("sent_kill", function() {
                done();
            });
        });

    });
});
