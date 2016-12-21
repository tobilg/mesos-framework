// Project require
var Scheduler = require("../").Scheduler;
var helpers = require("../lib/helpers");
var TaskHelper = require("../lib/taskHelper");
var winston = require('winston');
var http = require("http");
var util = require("util");
var EventEmitter = require('events').EventEmitter;
var mesos = (require("../lib/mesos"))().getMesos();
var schedulerHandlers = require("../lib/schedulerHandlers");

// Lib require for stubs
var zookeeper = require("node-zookeeper-client");

// Testing require
var expect = require('chai').expect;
var sinon = require("sinon");
var MockReq = require("mock-req");
var MockRes = require("mock-res");

describe('Scheduler constructor', function() {
    var sandbox;
    it("Check mesos access function", function () {
        (require("../lib/mesos"))().getProtoBuf();
    });
    it('Create the Scheduler with default options', function () {
        var scheduler = Scheduler({});
        expect(scheduler).to.be.instanceOf(Scheduler);
        expect(scheduler.tasks).to.be.an('array');
        expect(scheduler.tasks).to.have.lengthOf(0);
        expect(scheduler.requestTemplate.path).to.equal("/api/v1/scheduler");
        expect(scheduler.requestTemplate.host).to.equal(scheduler.options.masterUrl);
        expect(scheduler.requestTemplate.port).to.equal(scheduler.options.port);
    });
    it('Create the Scheduler with custom log file', function () {
        var scheduler = Scheduler({logging:{path:"logs", fileName:"tests.log"}});
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
                    cb(zookeeper.Exception.create(zookeeper.Exception.CONNECTION_LOSS), null, 1);
                }, 100);
            });
            var scheduler = Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: true, logging: {level: "debug"}, zkClient: zkClient});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
            });
            scheduler.on("ready", function() {
                isReady = true;
                console.log("got to ready");
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
            sandbox = sinon.sandbox.create();
            this.request = sandbox.stub(helpers, "doRequest");
        });
        afterEach(function() {
            helpers.doRequest.restore();
            sandbox.restore();
        });
        it("kill Success", function(done) {
            this.request.callsArgWith(1, null);
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("ready", function() {
                scheduler.kill("1234","12345");
            });
            var sent = false;
            scheduler.on("sent_kill", function() {
                sent = true;
                expect(sent).to.be.true;
            });
            setTimeout(function () {
                expect(sent).to.be.true;
                done();
            }, 400);
        });
        it("kill Fail", function(done) {
            var self = this;
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
            });
            scheduler.on("ready", function() {
                self.request.callsArgWith(1, { message: "Request was not accepted properly. Reponse status code was '400'. Body was 'malformed request'." });
                scheduler.kill("1234","12345");
            });
            var sent = false;
            scheduler.on("sent_kill", function() {
                sent = true;
                expect(sent).to.be.false;
            });
            setTimeout(function () {
                expect(sent).to.be.false;
                done();
            }, 400);
        });
        it("shutdown Success", function(done) {
            this.request.callsArgWith(1, null);
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("ready", function() {
                scheduler.shutdown("1234","12345");
            });
            var sent = false;
            scheduler.on("sent_shutdown", function() {
                sent = true;
                expect(sent).to.be.true;
            });
            setTimeout(function () {
                expect(sent).to.be.true;
                done();
            }, 400);
        });
        it("shutdown fail", function(done) {
            this.request.callsArgWith(1, { message: "Request was not accepted properly. Reponse status code was '400'. Body was 'malformed request'." });
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
            });
            scheduler.on("ready", function() {
                scheduler.shutdown("1234","12345");
            });
            var sent = false;
            scheduler.on("sent_shutdown", function() {
                sent = true;
                expect(sent).to.be.false;
            });
            setTimeout(function () {
                expect(sent).to.be.false;
                done();
            }, 400);
        });
        it("reconcile Success", function(done) {
            this.request.callsArgWith(1, null);
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("ready", function() {
                scheduler.reconcile("1234","12345");
            });
            var sent = false;
            scheduler.on("sent_reconcile", function() {
                sent = true;
                expect(sent).to.be.true;
            });
            setTimeout(function () {
                expect(sent).to.be.true;
                done();
            }, 400);
        });
        it("reconcile fail", function(done) {
            this.request.callsArgWith(1, { message: "Request was not accepted properly. Reponse status code was '400'. Body was 'malformed request'." });
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
            });
            scheduler.on("ready", function() {
                scheduler.reconcile("1234","12345");
            });
            var sent = false;
            scheduler.on("sent_reconcile", function() {
                sent = true;
                expect(sent).to.be.false;
            });
            setTimeout(function () {
                expect(sent).to.be.false;
                done();
            }, 400);
        });
        it("revive Success", function(done) {
            this.request.callsArgWith(1, null);
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("ready", function() {
                scheduler.revive();
            });
            var sent = false;
            scheduler.on("sent_revive", function() {
                sent = true;
                expect(sent).to.be.true;
            });
            setTimeout(function () {
                expect(sent).to.be.true;
                done();
            }, 400);
        });
        it("revive fail", function(done) {
            this.request.callsArgWith(1,  { message: "Request was not accepted properly. Reponse status code was '400'. Body was 'malformed request'." });
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
            });
            scheduler.on("ready", function() {
                scheduler.revive();
            });
            var sent = false;
            scheduler.on("sent_revive", function() {
                sent = true;
                expect(sent).to.be.false;
            });
            setTimeout(function () {
                expect(sent).to.be.false;
                done();
            }, 400);
        });
        it("sync Success", function(done) {
            this.request.callsArgWith(1, null);
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("ready", function() {
                scheduler.killTasks = [{taskId: "1234", runtimeInfo:{agentId:"12345"}}, {taskId: "12354", runtimeInfo:{agentId:"123455"}}];
                scheduler.reconcileTasks = [{taskId: "12345", runtimeInfo:{agentId:"123456"}}, {taskId: "12364", runtimeInfo:{agentId:"123465"}}, {taskId: "123754", runtimeInfo:{}}];
                scheduler.sync();
            });
            var sent = 0;
            scheduler.on("sent_reconcile", function() {
                sent++;
                expect(sent).to.be.above(0);
            });
            scheduler.on("sent_kill", function() {
                sent++;
                expect(sent).to.be.above(0);
            });
            setTimeout(function () {
                expect(sent).to.equal(4);
                expect(scheduler.killTasks).to.have.length.of(0);
                expect(scheduler.reconcileTasks).to.have.length.of(0);
                done();
            }, 400);
        });
        it("sync Success with zk and bad task", function(done) {
            this.request.callsArgWith(1, null);
            var taskHelper = new TaskHelper({"zkClient": {}, "logger": {}, "pendingTasks":[], "launchedTasks":[], scheduler:{}});
            sandbox.stub(taskHelper, "deleteTask");
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("ready", function() {
                scheduler.killTasks = [{taskId: "1234", runtimeInfo:{agentId:"12345"}}, {taskId: "12354", runtimeInfo:{agentId:"123455"}}];
                scheduler.reconcileTasks = [{taskId: "12345", runtimeInfo:{agentId:"123456"}}, {taskId: "12364", runtimeInfo:{agentId:"123465"}}, {taskId: "123754", runtimeInfo:{}}];
                scheduler.options.useZk = true;
                scheduler.taskHelper = taskHelper;
                scheduler.sync();
            });
            var sentRec = 0;
            var sentKill = 0;
            scheduler.on("sent_reconcile", function() {
                sentRec++;
                expect(sentRec).to.be.above(0);
            });
            scheduler.on("sent_kill", function() {
                sentKill++;
                expect(sentKill).to.be.above(0);
            });
            setTimeout(function () {
                expect(sentRec).to.equal(3);
                expect(sentKill).to.equal(2);
                expect(scheduler.killTasks).to.have.length.of(0);
                expect(scheduler.reconcileTasks).to.have.length.of(0);
                done();
            }, 400);
        });
        it("teardown Success", function(done) {
            this.request.callsArgWith(1, null);
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("ready", function() {
                scheduler.teardown();
            });
            var sent = false;
            scheduler.on("sent_teardown", function() {
                sent = true;
                expect(sent).to.be.true;
            });
            setTimeout(function () {
                expect(sent).to.be.true;
                done();
            }, 400);
        });
        it("teardown fail", function(done) {
            this.request.callsArgWith(1, { message: "Request was not accepted properly. Reponse status code was '400'. Body was 'malformed request'." });
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
            });
            scheduler.on("ready", function() {
                scheduler.teardown();
            });
            var sent = false;
            scheduler.on("sent_teardown", function() {
                sent = true;
                expect(sent).to.be.false;
            });
            setTimeout(function () {
                expect(sent).to.be.false;
                done();
            }, 400);
        });
        it("acknowledge success", function(done) {
            this.request.callsArgWith(1, null); // { message: "Request was not accepted properly. Reponse status code was '400'. Body was 'malformed request'." });
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
            });
            scheduler.on("ready", function() {
                scheduler.acknowledge({status:{agent_id:"1234", task_id:"123456",uuid:"1232153212"}});
            });
            var sent = false;
            scheduler.on("sent_acknowledge", function() {
                sent = true;
                expect(sent).to.be.true;
            });
            setTimeout(function () {
                expect(sent).to.be.true;
                done();
            }, 400);
        });
        it("acknowledge no uuid", function(done) {
            this.request.callsArgWith(1, null); // { message: "Request was not accepted properly. Reponse status code was '400'. Body was 'malformed request'." });
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
            });
            scheduler.on("ready", function() {
                scheduler.acknowledge({status:{agent_id:"1234", task_id:"123456"}});
            });
            var sent = false;
            scheduler.on("sent_acknowledge", function() {
                sent = true;
                expect(sent).to.be.false;
            });
            setTimeout(function () {
                expect(sent).to.be.false;
                done();
            }, 400);
        });
        it("acknowledge fail", function(done) {
            this.request.callsArgWith(1, { message: "Request was not accepted properly. Reponse status code was '400'. Body was 'malformed request'." });
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
            });
            scheduler.on("ready", function() {
                scheduler.acknowledge({status:{agent_id:"1234", task_id:"123456", uuid:"12312451251"}});
            });
            var sent = false;
            scheduler.on("sent_acknowledge", function() {
                sent = true;
                expect(sent).to.be.false;
            });
            setTimeout(function () {
                expect(sent).to.be.false;
                done();
            }, 400);
        });
        it("accept success", function(done) {
            this.request.callsArgWith(1, null);//{ message: "Request was not accepted properly. Reponse status code was '400'. Body was 'malformed request'." });
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
            });
            var sent = false;
            var toLaunch = [];
            var demandedResources = [
                        helpers.stringifyEnumsRecursive(new mesos.Resource("cpus", mesos.Value.Type.SCALAR, new mesos.Value.Scalar(1))),
                        helpers.stringifyEnumsRecursive(new mesos.Resource("mem", mesos.Value.Type.SCALAR, new mesos.Value.Scalar(128)))
                    ];
            scheduler.frameworkId = "123445547452563";
            toLaunch.push(
                        new mesos.TaskInfo(
                            "312312", // Task name
                            new mesos.TaskID("23242"),   // TaskID
                            {value:"321312"},             // AgentID
                            demandedResources,          // Resources
                            null,   // ExecutorInfo
                            null,     // CommandInfo
                            null, // ContainerInfo
                            null,     // HealthCheck
                            null, // KillPolicy
                            null, // Data
                            null, // Labels
                            null  // DiscoveryInfo
                        )
                    );
            var Operations = helpers.stringifyEnumsRecursive(
                        new mesos.Offer.Operation(
                            mesos.Offer.Operation.Type.LAUNCH,
                            new mesos.Offer.Operation.Launch(toLaunch)
                        )
                    );
            scheduler.on("ready", function() {
                scheduler.accept([{value:"12312312"}], Operations, null);
            });
            scheduler.on("sent_accept", function() {
                sent = true;
                expect(sent).to.be.true;
            });
            setTimeout(function () {
                expect(sent).to.be.true;
                done();
            }, 400);
        });
        it("accept error", function(done) {
            this.request.callsArgWith(1, { message: "Request was not accepted properly. Reponse status code was '400'. Body was 'malformed request'." });
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
            });
            var sent = false;
            var toLaunch = [];
            var demandedResources = [
                        helpers.stringifyEnumsRecursive(new mesos.Resource("cpus", mesos.Value.Type.SCALAR, new mesos.Value.Scalar(1))),
                        helpers.stringifyEnumsRecursive(new mesos.Resource("mem", mesos.Value.Type.SCALAR, new mesos.Value.Scalar(128)))
                    ];
            scheduler.frameworkId = "123445547452563";
            toLaunch.push(
                        new mesos.TaskInfo(
                            "312312", // Task name
                            new mesos.TaskID("23242"),   // TaskID
                            {value:"321312"},             // AgentID
                            demandedResources,          // Resources
                            null,   // ExecutorInfo
                            null,     // CommandInfo
                            null, // ContainerInfo
                            null,     // HealthCheck
                            null, // KillPolicy
                            null, // Data
                            null, // Labels
                            null  // DiscoveryInfo
                        )
                    );
            var Operations = helpers.stringifyEnumsRecursive(
                        new mesos.Offer.Operation(
                            mesos.Offer.Operation.Type.LAUNCH,
                            new mesos.Offer.Operation.Launch(toLaunch)
                        )
                    );
            scheduler.on("ready", function() {
                scheduler.accept([{value:"12312312"}], Operations, null);
            });
            scheduler.on("sent_accept", function() {
                sent = true;
                expect(sent).to.be.false;
            });
            setTimeout(function () {
                expect(sent).to.be.false;
                done();
            }, 400);
        });
        it("decline success", function(done) {
            this.request.callsArgWith(1, null);//{ message: "Request was not accepted properly. Reponse status code was '400'. Body was 'malformed request'." });
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
            });
            var sent = false;

            scheduler.frameworkId = "123445547452563";

            scheduler.on("ready", function() {
                scheduler.decline([{value:"12312312"}], {});
            });
            scheduler.on("sent_decline", function() {
                sent = true;
                expect(sent).to.be.true;
            });
            setTimeout(function () {
                expect(sent).to.be.true;
                done();
            }, 400);
        });
        it("decline error", function(done) {
            this.request.callsArgWith(1, { message: "Request was not accepted properly. Reponse status code was '400'. Body was 'malformed request'." });
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
            });
            var sent = false;

            scheduler.frameworkId = "123445547452563";

            scheduler.on("ready", function() {
                scheduler.decline([{value:"12312312"}], {});
            });
            scheduler.on("sent_decline", function() {
                sent = true;
                expect(sent).to.be.false;
            });
            setTimeout(function () {
                expect(sent).to.be.false;
                done();
            }, 400);
        });
        it("message success", function(done) {
            this.request.callsArgWith(1, null);//{ message: "Request was not accepted properly. Reponse status code was '400'. Body was 'malformed request'." });
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
            });
            var sent = false;

            scheduler.frameworkId = "123445547452563";

            scheduler.on("ready", function() {
                scheduler.message("12312312", "dasfasfafas", "sdfasfasfgasgloewy2398y423r5fqwncas");
            });
            scheduler.on("sent_message", function() {
                sent = true;
                expect(sent).to.be.true;
            });
            setTimeout(function () {
                expect(sent).to.be.true;
                done();
            }, 400);
        });
        it("message fail", function(done) {
            this.request.callsArgWith(1, { message: "Request was not accepted properly. Reponse status code was '400'. Body was 'malformed request'." });
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
            });
            var sent = false;

            scheduler.frameworkId = "123445547452563";

            scheduler.on("ready", function() {
                scheduler.message("12312312", "dasfasfafas", "sdfasfasfgasgloewy2398y423r5fqwncas");
            });
            scheduler.on("sent_message", function() {
                sent = true;
                expect(sent).to.be.false;
            });
            setTimeout(function () {
                expect(sent).to.be.false;
                done();
            }, 400);
        });
        it("request success", function(done) {
            this.request.callsArgWith(1, null);//{ message: "Request was not accepted properly. Reponse status code was '400'. Body was 'malformed request'." });
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
            });
            var sent = false;

            scheduler.frameworkId = "123445547452563";

            scheduler.on("ready", function() {
                scheduler.request(["12312312","fasfafas", "sdfasfasfgasgloewy2398y423r5fqwncas"]);
            });
            scheduler.on("sent_request", function() {
                sent = true;
                expect(sent).to.be.true;
            });
            setTimeout(function () {
                expect(sent).to.be.true;
                done();
            }, 400);
        });
        it("request fail", function(done) {
            this.request.callsArgWith(1, { message: "Request was not accepted properly. Reponse status code was '400'. Body was 'malformed request'." });
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
            });
            var sent = false;

            scheduler.frameworkId = "123445547452563";

            scheduler.on("ready", function() {
                scheduler.request(["12312312","fasfafas", "sdfasfasfgasgloewy2398y423r5fqwncas"]);
            });
            scheduler.on("sent_request", function() {
                sent = true;
                expect(sent).to.be.false;
            });
            setTimeout(function () {
                expect(sent).to.be.false;
                done();
            }, 400);
        });
        it("getRunningTasks", function(done) {
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
            });
            scheduler.on("ready", function() {
                scheduler.runtimeInfo = {"one": {"runningInstances": {"task1":"12124521", "task2":"2343541"}}};
                var tasks = scheduler.getRunningTasks();
                expect(tasks).to.be.an("array");
                expect(tasks.length).to.equal(2);
                done();
            });
        });
    });

    describe("Subscribe flow", function() {
        beforeEach(function() {
            this.request = sinon.stub(http, "request");
        });
        afterEach(function() {
            http.request.restore();
        });
        it("error http status (fail)", function(done) {
            var data = "OK";
            var res = new MockRes();
            res.writeHead(500);
            res.write(data);
            res.headers = {};
            res.end();
            var req = new MockReq({ method: 'POST' });
            this.request.callsArgWith(1, res).returns(req);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                done();
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
        });
        it("http redirect status no location (fail)", function(done) {
            var data = "OK";
            var res = new MockRes();
            res.writeHead(307);
            res.write(data);
            res.headers = {};
            res.end();
            var req = new MockReq({ method: 'POST' });
            this.request.callsArgWith(1, res).returns(req);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                done();
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
        });
        it("http redirect status with location (fail)", function(done) {
            var data = "OK";
            var res = new MockRes();
            var errors = 0;
            res.writeHead(307);
            res.write(data);
            res.headers = {"location":"http://1.2.3.4:5030/fgs/fgdsg"};
            res.end();
            var req = new MockReq({ method: 'POST' });
            this.request.onFirstCall().callsArgWith(1, res).returns(req);
            var res2 = new MockRes();
            res2.writeHead(500);
            res2.write(data);
            res2.headers = {};
            res2.end();
            this.request.onSecondCall().callsArgWith(1, res2).returns(req);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errors++;
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function (){
                expect(scheduler.options.masterUrl).to.equal("1.2.3.4");
                expect(scheduler.options.port).to.equal("5030");
                expect(errors).to.equal(3);
                done();
            }, 200);
        });
        it("http redirect status with location without scheme and path (fail)", function(done) {
            var data = "OK";
            var res = new MockRes();
            var errors = 0;
            res.writeHead(307);
            res.write(data);
            res.headers = {"location":"1.2.3.4:5030"};
            res.end();
            var req = new MockReq({ method: 'POST' });
            this.request.onFirstCall().callsArgWith(1, res).returns(req);
            var res2 = new MockRes();
            res2.writeHead(500);
            res2.write(data);
            res2.headers = {};
            res2.end();
            this.request.onSecondCall().callsArgWith(1, res2).returns(req);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errors++;
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function (){
                expect(errors).to.equal(3);
                expect(scheduler.options.masterUrl).to.equal("1.2.3.4");
                expect(scheduler.options.port).to.equal("5030");
                done();
            }, 200);
        });
        it("error http status no message (fail)", function(done) {
            var data = "";
            var res = new MockRes();
            res.writeHead(500);
            res.headers = {};
            var req = new MockReq({ method: 'POST' });
            this.request.callsArgWith(1, res).returns(req);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                done();
            });
            setTimeout(function () {
                res.write(data);
                res.emit("data", "");
                res.end();
            }, 100);
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
        });
        it("OK http status - no stream id (fail)", function(done) {
            var data = "OK";
            var res = new MockRes();
            res.writeHead(200);
            res.write(data);
            res.headers = {};
            res.end();
            var req = new MockReq({ method: 'POST' });
            this.request.callsArgWith(1, res).returns(req);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                done();
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
        });
        it("OK http status - with stream id, really short response (fail)", function(done) {
            var data = "OK";
            var res = new MockRes();
            var errorSet = false;
            res.writeHead(200);
            res.write(data);
            res.headers = {"mesos-stream-id":"123412412"};
            res.end();
            var req = new MockReq({ method: 'POST' });
            this.request.callsArgWith(1, res).returns(req);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errorSet = true;
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function () {
                expect(errorSet).to.be.true;
                done();
            }, 400);
        });
        it("OK http status - with stream id, invalid JSON response (fail)", function(done) {
            var data = "2\nOK";
            var res = new MockRes();
            var errorSet = false;
            res.writeHead(200);
            res.write(data);
            res.headers = {"mesos-stream-id":"123412412"};
            res.end();
            var req = new MockReq({ method: 'POST' });
            this.request.callsArgWith(1, res).returns(req);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errorSet = true;
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function () {
                expect(errorSet).to.be.true;
                done();
            }, 400);
        });
        it("OK http status - with stream id, too many line ends (fail)", function(done) {
            var data = "2\nOK\n";
            var res = new MockRes();
            var errorSet = false;
            res.writeHead(200);
            res.write(data);
            res.headers = {"mesos-stream-id":"123412412"};
            res.end();
            var req = new MockReq({ method: 'POST' });
            this.request.callsArgWith(1, res).returns(req);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errorSet = true;
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function () {
                expect(errorSet).to.be.true;
                done();
            }, 400);
        });
        it("OK http status - with stream id, chunked (fail)", function(done) {
            var data = "4\nOK";
            var data2 = "ok";
            var res = new MockRes();
            var errorSet = false;
            res.writeHead(200);
            res.write(data);
            res.headers = {"mesos-stream-id":"123412412"};
            var req = new MockReq({ method: 'POST' });
            this.request.callsArgWith(1, res).returns(req);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errorSet = true;
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function () {
                res.write(data2);
                res.end();
            }, 400);

            setTimeout(function () {
                expect(errorSet).to.be.true;
                done();
            }, 600);
        });
        it("OK http status - with stream id, valid JSON response, no type (fail)", function(done) {
            var data = "2\n{}";
            var res = new MockRes();
            var errorSet = false;
            res.writeHead(200);
            res.write(data);
            res.headers = {"mesos-stream-id":"123412412"};
            res.end();
            var req = new MockReq({ method: 'POST' });
            this.request.callsArgWith(1, res).returns(req);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errorSet = true;
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function () {
                expect(errorSet).to.be.true;
                done();
            }, 400);
        });
        it("OK http status - with stream id, valid JSON response, invalid type (fail)", function(done) {
            var data = "2\n{\"type\":\"testing\"}";
            var res = new MockRes();
            var errorSet = false;
            res.writeHead(200);
            res.write(data);
            res.headers = {"mesos-stream-id":"123412412"};
            res.end();
            var req = new MockReq({ method: 'POST' });
            this.request.callsArgWith(1, res).returns(req);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errorSet = true;
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function () {
                expect(errorSet).to.be.true;
                done();
            }, 400);
        });
        it("OK http status - with stream id, valid JSON response, closed (fail)", function(done) {
            var data = "2\n{\"type\":\"testing\"}";
            var res = new MockRes();
            var errorSet = false;
            res.writeHead(200);
            res.write(data);
            res.headers = {"mesos-stream-id":"123412412"};
            var req = new MockReq({ method: 'POST' });
            this.request.callsArgWith(1, res).returns(req);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errorSet = true;
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function () {
                res.emit("close");
            }, 200);
            setTimeout(function () {
                expect(errorSet).to.be.true;
                done();
            }, 600);
        });
        it("OK http status - with stream id, valid JSON response, valid type (noop)", function(done) {
            var data = "2\n{\"type\":\"RESCIND\"}";
            var res = new MockRes();
            var errorSet = false;
            var called = false;
            res.writeHead(200);
            res.write(data);
            res.headers = {"mesos-stream-id":"123412412"};
            //res.end();
            var req = new MockReq({ method: 'POST' });
            this.request.callsArgWith(1, res).returns(req);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errorSet = true;
            });
            scheduler.on("rescind", function(event) {
                console.log(JSON.stringify(event));
                called = true;
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function () {
                expect(errorSet).to.be.false;
                expect(called).to.be.true;
                done();
            }, 400);
        });
        it("OK http status - with stream id, valid JSON response, valid type, preset framework ID (noop)", function(done) {
            var data = "2\n{\"type\":\"RESCIND\"}";
            var res = new MockRes();
            var errorSet = false;
            var called = false;
            res.writeHead(200);
            res.write(data);
            res.headers = {"mesos-stream-id":"123412412"};
            //res.end();
            var req = new MockReq({ method: 'POST' });
            this.request.callsArgWith(1, res).returns(req);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errorSet = true;
            });
            scheduler.on("rescind", function(event) {
                console.log(JSON.stringify(event));
                called = true;
            });
            scheduler.on("ready", function () {
                scheduler.frameworkId = "12413412";
                scheduler.subscribe();
            });
            setTimeout(function () {
                expect(errorSet).to.be.false;
                expect(called).to.be.true;
                done();
            }, 400);
        });
        it("OK http status - with stream id, valid JSON response, valid type (subscribed)", function(done) {
            var data = "2\n{\"type\":\"SUBSCRIBED\",\"subscribed\":{\"framework_id\":{\"value\":\"122353532\"}}}";
            var res = new MockRes();
            var errorSet = false;
            var called = false;
            res.writeHead(200);
            res.write(data);
            res.headers = {"mesos-stream-id":"123412412"};
            //res.end();
            var req = new MockReq({ method: 'POST' });
            this.request.callsArgWith(1, res).returns(req);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errorSet = true;
            });
            scheduler.on("subscribed", function(event) {
                console.log(JSON.stringify(event));
                called = true;
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function () {
                expect(errorSet).to.be.false;
                expect(called).to.be.true;
                done();
            }, 400);
        });
        it("OK http status - with stream id, valid JSON response, valid type and timeout (subscribed)", function(done) {
            function SocketStub() {
                // Inherit from EventEmitter
                EventEmitter.call(this);
                return this;
            };

            util.inherits(SocketStub, EventEmitter);

            var data = "2\n{\"type\":\"SUBSCRIBED\",\"subscribed\":{\"framework_id\":{\"value\":\"122353532\"}}}";
            var res = new MockRes();
            var errorSet = false;
            var called = false;
            res.writeHead(200);
            res.write(data);
            res.headers = {"mesos-stream-id":"123412412"};
            //res.end();
            var req = new MockReq({ method: 'POST' });
            this.request.callsArgWith(1, res).returns(req);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errorSet = true;
            });
            scheduler.on("subscribed", function(event) {
                console.log(JSON.stringify(event));
                var socket = new SocketStub();
                socket.setTimeout = function () {
                    setTimeout(function () {
                        socket.emit("timeout");
                    },100);
                };
                req.emit("socket", socket);
                called = true;
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function () {
                expect(errorSet).to.be.false;
                expect(called).to.be.true;
                done();
            }, 400);
        });
        it("OK http status - with stream id, valid JSON response, valid type and timeout with redirect (subscribed)", function(done) {
            function SocketStub() {
                // Inherit from EventEmitter
                EventEmitter.call(this);
                return this;
            };

            util.inherits(SocketStub, EventEmitter);

            var self = this;
            var data = "2\n{\"type\":\"SUBSCRIBED\",\"subscribed\":{\"framework_id\":{\"value\":\"122353532\"}}}";
            var res = new MockRes();
            var res2 = new MockRes();
            var res3 = new MockRes();
            var errorSet = false;
            var called = false;
            var timer = null;
            res.writeHead(200);
            res.write(data);
            res.headers = {"mesos-stream-id":"123412412"};
            res3.writeHead(200);
            res3.write(data);
            res3.headers = {"mesos-stream-id":"123412412"};
            //res.end();
            var req = new MockReq({ method: 'POST' });
            var req2 = new MockReq({ method: 'POST' });
            var req3 = new MockReq({ method: 'POST' });
            this.request.onFirstCall().callsArgWith(1, res).returns(req);
            this.request.onSecondCall().callsArgWith(1, res2).returns(req2);
            this.request.onThirdCall().callsArgWith(1, res3).returns(req3);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errorSet = true;
            });
            scheduler.on("subscribed", function(event) {
                console.log(JSON.stringify(event));
                var socket = new SocketStub();
                socket.setTimeout = function () {
                    var self = this;
                    if (!timer) {
                        timer = setTimeout(function () {
                            res2.writeHead(307);
                            res2.headers = {"location":"1.2.3.4:5030"};
                            res2.write(data);
                            self.emit("timeout");
                        },100);
                    }
                };
                req.emit("socket", socket);
                called = true;
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function () {
                expect(called).to.be.true;
                expect(self.request.calledThrice).to.be.true;
                done();
            }, 400);
        });
        it("OK http status - with stream id, valid JSON response, valid type and timeout with redirect and timeout (fail)", function(done) {
            function SocketStub() {
                // Inherit from EventEmitter
                EventEmitter.call(this);
                return this;
            };

            util.inherits(SocketStub, EventEmitter);

            var self = this;
            var data = "2\n{\"type\":\"SUBSCRIBED\",\"subscribed\":{\"framework_id\":{\"value\":\"122353532\"}}}";
            var res = new MockRes();
            var res2 = new MockRes();
            var res3 = new MockRes();
            var errorSet = false;
            var called = false;
            var timer = null;
            var timer2 = null;
            res.writeHead(200);
            res.write(data);
            res.headers = {"mesos-stream-id":"123412412"};
            res3.writeHead(200);
            res3.write(data);
            res3.headers = {"mesos-stream-id":"123412412"};
            //res.end();
            var req = new MockReq({ method: 'POST' });
            var req2 = new MockReq({ method: 'POST' });
            var req3 = new MockReq({ method: 'POST' });
            this.request.onFirstCall().callsArgWith(1, res).returns(req);
            this.request.onSecondCall().callsArgWith(1, res2).returns(req2);
            this.request.onThirdCall().callsArgWith(1, res3).returns(req3);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            sinon.stub(process, "exit");
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errorSet = true;
            });
            scheduler.on("subscribed", function(event) {
                console.log(JSON.stringify(event));
                var socket = new SocketStub();
                var socket2 = new SocketStub();
                socket2.setTimeout = function () {
                    if (!timer2) {
                        timer2 = setTimeout(function () {
                            socket2.emit("timeout");
                        },100);
                    }
                };
                if (timer) {
                    req2.emit("socket", socket2);
                }
                socket.setTimeout = function () {
                    if (!timer) {
                        timer = setTimeout(function () {
                            res2.writeHead(307);
                            res2.headers = {"location":"1.2.3.4:5030"};
                            res2.write(data);
                            socket.emit("timeout");
                        },100);
                    }
                };
                if (!called) {
                    setTimeout(function () {
                        req.emit("socket", socket);
                    }, 10);
                }
                called = true;
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function () {
                expect(called).to.be.true;
                expect(self.request.calledThrice).to.be.true;
                expect(process.exit.calledOnce).to.be.true;
                process.exit.restore();
                done();
            }, 400);
        });
        it("OK http status - with stream id, valid JSON response, valid type and timeout with DNS (subscribed)", function(done) {
            function SocketStub() {
                // Inherit from EventEmitter
                EventEmitter.call(this);
                return this;
            };

            util.inherits(SocketStub, EventEmitter);

            var self = this;
            var data = "2\n{\"type\":\"SUBSCRIBED\",\"subscribed\":{\"framework_id\":{\"value\":\"122353532\"}}}";
            var res = new MockRes();
            var res2 = new MockRes();
            var errorSet = false;
            var called = false;
            var timer = null;
            res.writeHead(200);
            res.write(data);
            res.headers = {"mesos-stream-id":"123412412"};
            res2.writeHead(200);
            res2.write(data);
            res2.headers = {"mesos-stream-id":"123412412"};
            //res.end();
            var req = new MockReq({ method: 'POST' });
            this.request.onFirstCall().callsArgWith(1, res).returns(req);
            this.request.onSecondCall().callsArgWith(1, res2).returns(req);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, masterUrl: "leader.mesos", logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errorSet = true;
            });
            scheduler.on("subscribed", function(event) {
                console.log(JSON.stringify(event));
                var socket = new SocketStub();
                socket.setTimeout = function () {
                    var self = this;
                    if (!timer) {
                        timer = setTimeout(function () {
                            res2.writeHead(200);
                            //res.headers = {"location":"1.2.3.4:5030"};
                            //res2.write(data);
                            self.emit("timeout");
                        },100);
                    }
                };
                req.emit("socket", socket);
                called = true;
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function () {
                expect(called).to.be.true;
                expect(self.request.calledTwice).to.be.true;
                done();
            }, 400);
        });
        it("OK http status - with stream id, valid JSON response, valid type (message)", function(done) {
            var data = "2\n{\"type\":\"MESSAGE\",\"message\":{\"agent_id\":{\"value\":\"122353532\"},\"executor_id\":{\"value\":\"fsdfsdsgd\"},\"data\":\"fdsgsdgsdgds\"}}";
            var res = new MockRes();
            var errorSet = false;
            var called = false;
            res.writeHead(200);
            res.write(data);
            res.headers = {"mesos-stream-id":"123412412"};
            //res.end();
            var req = new MockReq({ method: 'POST' });
            this.request.callsArgWith(1, res).returns(req);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errorSet = true;
            });
            scheduler.on("message", function(event) {
                console.log(JSON.stringify(event));
                called = true;
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function () {
                expect(errorSet).to.be.false;
                expect(called).to.be.true;
                done();
            }, 400);
        });
        it("OK http status - with stream id, valid JSON response, valid type (heartbeat)", function(done) {
            var data = "2\n{\"type\":\"HEARTBEAT\"}";
            var res = new MockRes();
            var errorSet = false;
            var called = false;
            res.writeHead(200);
            res.write(data);
            res.headers = {"mesos-stream-id":"123412412"};
            //res.end();
            var req = new MockReq({ method: 'POST' });
            this.request.callsArgWith(1, res).returns(req);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errorSet = true;
            });
            scheduler.on("heartbeat", function(event) {
                console.log(JSON.stringify(event));
                called = true;
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function () {
                expect(errorSet).to.be.false;
                expect(called).to.be.true;
                done();
            }, 400);
        });
        it("OK http status - with stream id, valid JSON response, valid type, custom handler (heartbeat)", function(done) {
            var data = "2\n{\"type\":\"HEARTBEAT\"}";
            var res = new MockRes();
            var errorSet = false;
            var called = false;
            res.writeHead(200);
            res.write(data);
            res.headers = {"mesos-stream-id":"123412412"};
            //res.end();
            var req = new MockReq({ method: 'POST' });
            this.request.callsArgWith(1, res).returns(req);
            var scheduler = new Scheduler({tasks: {
                task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errorSet = true;
            });
            scheduler.customEventHandlers["HEARTBEAT"] = function (event) {
                called = true;
            };
            scheduler.on("heartbeat", function(event) {
                console.log(JSON.stringify(event));
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function () {
                expect(errorSet).to.be.false;
                expect(called).to.be.true;
                done();
            }, 400);
        });
    });
    describe("Subscribe with ZK", function () {
        var zkClient = zookeeper.createClient("127.0.0.1");
        var logger = helpers.getLogger(null, null, "debug");
        var taskHelper = new TaskHelper({"zkClient": zkClient, "logger": logger, "pendingTasks":[], "launchedTasks":[], scheduler:{}})
        beforeEach(function () {
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
            sandbox.stub(zkClient, "getData");
            sandbox.stub(taskHelper, "loadTasks", function() {
                var self = this;
                setTimeout(function() {
                    self.scheduler.emit("ready");
                }, 100);
            });
            sandbox.stub(zkClient, "mkdirp");
            sandbox.stub(zkClient, "setData");
            sandbox.stub(zkClient, "close");
            this.request = sandbox.stub(helpers, "doRequest");
            this.httpRequest = sandbox.stub(http, "request");
        });
        afterEach(function (done) {
            helpers.doRequest.restore();
            http.request.restore();
            sandbox.restore();
            done();
        });
        it("Success path (not saved in ZK)", function (done) {
            var data = "2\n{\"type\":\"SUBSCRIBED\",\"subscribed\":{\"framework_id\":{\"value\":\"122353532\"}}}";
            var res = new MockRes();
            var errorSet = false;
            var called = false;
            res.writeHead(200);
            res.write(data);
            res.headers = {"mesos-stream-id":"123412412"};
            //res.end();
            var req = new MockReq({ method: 'POST' });
            this.httpRequest.callsArgWith(1, res).returns(req);
            zkClient.getData.callsArgWith(2, zookeeper.Exception.create(zookeeper.Exception.NO_NODE));
            zkClient.mkdirp.callsArgWith(1, null);
            zkClient.setData.callsArgWith(2, null);
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: true, logging: {level: "debug"}, zkClient: zkClient, taskHelper: taskHelper});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errorSet = true;
            });
            scheduler.on("subscribed", function(event) {
                console.log("Test error: " + JSON.stringify(event));
                called = true;
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function () {
                expect(errorSet).to.be.false;
                expect(called).to.be.true;
                expect(scheduler.options.useZk).to.be.true;
                done();
            }, 400);
        });
        it("Success path (saved in ZK)", function (done) {
            var data = "2\n{\"type\":\"SUBSCRIBED\",\"subscribed\":{\"framework_id\":{\"value\":\"122353532\"}}}";
            var res = new MockRes();
            var errorSet = false;
            var called = false;
            res.writeHead(200);
            res.write(data);
            res.headers = {"mesos-stream-id":"123412412"};
            //res.end();
            var req = new MockReq({ method: 'POST' });
            this.httpRequest.callsArgWith(1, res).returns(req);
            zkClient.getData.callsArgWith(2, null, "122353532");
            zkClient.mkdirp.callsArgWith(1, null);
            zkClient.setData.callsArgWith(2, null);
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: true, logging: {level: "debug"}, zkClient: zkClient, taskHelper: taskHelper});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errorSet = true;
            });
            scheduler.on("subscribed", function(event) {
                console.log("Test error: " + JSON.stringify(event));
                called = true;
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function () {
                expect(errorSet).to.be.false;
                expect(called).to.be.true;
                expect(scheduler.options.useZk).to.be.true;
                done();
            }, 400);
        });
        it("Fail path (mkdirp)", function (done) {
            var data = "2\n{\"type\":\"SUBSCRIBED\",\"subscribed\":{\"framework_id\":{\"value\":\"122353532\"}}}";
            var res = new MockRes();
            var errorSet = false;
            var called = false;
            res.writeHead(200);
            res.write(data);
            res.headers = {"mesos-stream-id":"123412412"};
            //res.end();
            var req = new MockReq({ method: 'POST' });
            this.httpRequest.callsArgWith(1, res).returns(req);
            zkClient.getData.callsArgWith(2, zookeeper.Exception.create(zookeeper.Exception.NO_NODE));
            zkClient.mkdirp.callsArgWith(1, zookeeper.Exception.create(zookeeper.Exception.NO_NODE));
            zkClient.setData.callsArgWith(2, null);
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: true, logging: {level: "debug"}, zkClient: zkClient, taskHelper: taskHelper});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errorSet = true;
            });
            scheduler.on("subscribed", function(event) {
                console.log("Test error: " + JSON.stringify(event));
                called = true;
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function () {
                expect(errorSet).to.be.false;
                expect(called).to.be.true;
                expect(scheduler.options.useZk).to.be.false;
                done();
            }, 400);
        });
        it("Fail path (setData)", function (done) {
            var data = "2\n{\"type\":\"SUBSCRIBED\",\"subscribed\":{\"framework_id\":{\"value\":\"122353532\"}}}";
            var res = new MockRes();
            var errorSet = false;
            var called = false;
            res.writeHead(200);
            res.write(data);
            res.headers = {"mesos-stream-id":"123412412"};
            //res.end();
            var req = new MockReq({ method: 'POST' });
            this.httpRequest.callsArgWith(1, res).returns(req);
            zkClient.getData.callsArgWith(2, zookeeper.Exception.create(zookeeper.Exception.NO_NODE));
            zkClient.mkdirp.callsArgWith(1, null);
            zkClient.setData.callsArgWith(2, zookeeper.Exception.create(zookeeper.Exception.NO_NODE));
            var scheduler = new Scheduler({tasks: {
                    task1:{isSubmitted:true}
                },useZk: true, logging: {level: "debug"}, zkClient: zkClient, taskHelper: taskHelper});
            scheduler.on("error", function(error) {
                console.log(JSON.stringify(error));
                errorSet = true;
            });
            scheduler.on("subscribed", function(event) {
                console.log("Test error: " + JSON.stringify(event));
                called = true;
            });
            scheduler.on("ready", function () {
                scheduler.subscribe();
            });
            setTimeout(function () {
                expect(errorSet).to.be.false;
                expect(called).to.be.true;
                expect(scheduler.options.useZk).to.be.false;
                done();
            }, 400);
        });
    });
});
