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
        expect(scheduler.requestTemplate.path).to.equal("/api/v1/scheduler");
        expect(scheduler.requestTemplate.host).to.equal(scheduler.options.masterUrl);
        expect(scheduler.requestTemplate.port).to.equal(scheduler.options.port);
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
    });
});
