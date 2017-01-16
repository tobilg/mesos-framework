var helpers = require("../lib/helpers");
var mesos = require("../lib/mesos")().getMesos();

var winston = require("winston");
var http = require("http");

var expect = require("chai").expect;
var sinon = require("sinon");
var MockReq = require("mock-req");
var MockRes = require("mock-res");

describe("helpers", function() {
    it("Test the CloneDeep helper", function () {
        var objects = [{ "a": 1 }, { "b": 2 }];
 
        var deep = helpers.cloneDeep(objects);
        expect(deep[0] === objects[0]).to.be.false;
    });
    describe("sortTasksByPriority", function () {
        it("Sort the task array with 2 submitted tasks", function () {
            var tasks = helpers.sortTasksByPriority({
                    task1:{isSubmitted:true},
                    task2:{isSubmitted:true}});
            expect(tasks).to.be.an("array");
            expect(tasks).to.have.lengthOf(2);
        });
        it("Sort the task array with 3 submitted tasks with priority", function () {
            var tasks = helpers.sortTasksByPriority({
                    task1:{isSubmitted:true, priority:1},
                    task2:{isSubmitted:true, priority:2},
                    task3:{isSubmitted:true, priority:1}
                });
            expect(tasks).to.be.an("array");
            expect(tasks).to.have.lengthOf(3);
        });
        it("Sort the task array with 3 submitted tasks with priority and multiple instances", function () {
            var tasks = helpers.sortTasksByPriority({
                    task1:{isSubmitted:true, priority:1},
                    task2:{isSubmitted:true, priority:2},
                    task3:{isSubmitted:true, priority:1, instances:2}
                });
            expect(tasks).to.be.an("array");
            expect(tasks).to.have.lengthOf(4);
        });
        it("Sort the task array with 3 submitted tasks with priority and out of order names", function () {
            var tasks = helpers.sortTasksByPriority({
                    task3:{isSubmitted:true, priority:1},
                    task2:{isSubmitted:true, priority:2},
                    task1:{isSubmitted:true, priority:1}
                });
            expect(tasks).to.be.an("array");
            expect(tasks).to.have.lengthOf(3);
            expect(tasks[0].name).to.equal("task1-1");
        });
        it("Sort the task array with static ports out of order", function () {
            var tasks = helpers.sortTasksByPriority({
                task1: {isSubmitted: true, priority: 1, resources: {ports: 2, staticPorts: [9001, 8000]}}
            });
            expect(tasks).to.be.an("array");
            expect(tasks).to.have.lengthOf(1);
            expect(tasks[0].resources.staticPorts[0]).to.equal(8000);
        });
        it("Sort the task array with static ports out of order - no ports set", function () {
            try {
                helpers.sortTasksByPriority({
                    task1: {isSubmitted: true, priority: 1, resources: {staticPorts: [9001, 8000]}}
                });
            } catch (error) {
                expect(error).to.be.an.error;
            }
        });
        it("Sort the task array with static ports out of order - not enough ports set", function () {
            try {
                helpers.sortTasksByPriority({
                    task1: {isSubmitted: true, priority: 1, resources: {ports: 1, staticPorts: [9001, 8000]}}
                });
            } catch (error) {
                expect(error).to.be.an.error;
            }
        });
    });
    describe("Enum enumeration", function () {
        it("Simple enumeration", function () {
            var enumerated = helpers.stringifyEnums(new mesos.scheduler.Call(
            null,
            "SUBSCRIBE",
            null));
            expect(enumerated.type).to.equal("SUBSCRIBE");
        });
        it("Simple enumeration invalid value", function () {
            var base = new mesos.scheduler.Call(
            null,
            "SUBSCRIBE",
            null);
            base.type = 13;
            var enumerated = helpers.stringifyEnums(base);

            expect(enumerated.type).to.equal(13);
        });
        it("Recursive enumeration", function () {
            var ContainerInfo = new mesos.ContainerInfo(
                mesos.ContainerInfo.Type.DOCKER, // Type
                null, // Volumes
                null, // Hostname
                new mesos.ContainerInfo.DockerInfo(
                    "alpine", // Image
                    mesos.ContainerInfo.DockerInfo.Network.HOST, // Network
                    null,  // PortMappings
                    false, // Privileged
                    [{
                    "key": "cap-add",
                    "value": "IPC_LOCK"
                    }],  // Parameters
                    true, // forcePullImage
                    null   // Volume Driver
                )
            );
            var enumerated = helpers.stringifyEnumsRecursive(ContainerInfo);
            expect(enumerated.type).to.equal("DOCKER");
            expect(enumerated.docker.network).to.equal("HOST");
        });
    });
    describe("getLogger", function () {
        it("Default logger", function () {
            var logger = helpers.getLogger();
            expect(logger).to.be.an("Object");
            expect(logger).to.be.an.instanceof(winston.Logger);
        });
        it("Filename logger", function () {
            var logger = helpers.getLogger("logs","tests.log");
            expect(logger).to.be.an("Object");
            expect(logger).to.be.an.instanceof(winston.Logger);
        });
    });
    describe("doRequest", function() {
        beforeEach(function() {
            this.request = sinon.stub(http, "request");
        });
        afterEach(function() {
            http.request.restore();
        });
        it("OK state", function(done) {
            var data = "OK";
            var res = new MockRes();
            res.writeHead(202);
            res.write(data);
            res.end();
            var req = new MockReq({ method: "POST" });
            this.request.callsArgWith(1, res).returns(req);
            helpers.doRequest("",function (error, jsonResult) {
                console.log("Error is: " + JSON.stringify(error));
                console.log("Result is:" + JSON.stringify(jsonResult));
                expect(error).to.be.a("null");
                expect(jsonResult.body).to.equal(data);
                expect(jsonResult.statusCode).to.equal(202);
                done();
            });
        });
        it("OK state with stream-id", function(done) {
            var data = "OK";
            var res = new MockRes();
            res.writeHead(202);
            res.write(data);
            res.end();
            var req = new MockReq({ method: "POST" });
            this.request.callsArgWith(1, res).returns(req);
            this.requestTemplate = {
                host: "sfdsdfsfds",
                port: "5050",
                path: "/api/v1/scheduler",
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                    }
                };
            this.mesosStreamId = "123233523512";
            helpers.doRequest.call(this, "",function (error, jsonResult) {
                console.log("Error is: " + JSON.stringify(error));
                console.log("Result is:" + JSON.stringify(jsonResult));
                expect(error).to.be.a("null");
                expect(jsonResult.body).to.equal(data);
                expect(jsonResult.statusCode).to.equal(202);
                done();
            });
        });
        it("400 error", function(done) {
            var data = "OK";
            var res = new MockRes();
            res.writeHead(400);
            res.write(data);
            res.end();
            var req = new MockReq({ method: "POST" });
            this.request.callsArgWith(1, res).returns(req);
            helpers.doRequest("",function (error, jsonResult) {
                console.log("Error is: " + JSON.stringify(error));
                console.log("Result is:" + JSON.stringify(jsonResult));
                expect(error).not.to.be.a("null");
                expect(jsonResult).to.be.a("null");
                done();
            });
        });
        it("req error", function(done) {
            var data = "OK";
            var res = new MockRes();
            res.writeHead(400);
            res.write(data);
            res.end();
            var req = new MockReq({ method: "POST" });
            this.request.returns(req);
            helpers.doRequest("",function (error, jsonResult) {
                console.log("Error is: " + JSON.stringify(error));
                console.log("Result is:" + JSON.stringify(jsonResult));
                expect(error).not.to.be.a("null");
                expect(jsonResult).to.be.a("null");
                done();
            });
            req.emit("error", data);
        });
        it("res error", function(done) {
            var data = "OK";
            var res = new MockRes();
            res.writeHead(400);
            res.write(data);
            //res.end();
            var req = new MockReq({ method: "POST" });
            this.request.callsArgWith(1, res).returns(req);
            helpers.doRequest("",function (error, jsonResult) {
                console.log("Error is: " + JSON.stringify(error));
                console.log("Result is:" + JSON.stringify(jsonResult));
                expect(error).not.to.be.a("null");
                expect(jsonResult).to.be.a("null");
                done();
            });
            res.emit("error", data);
        });
    });
});
