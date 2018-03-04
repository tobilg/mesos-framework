/*global describe, before, beforeEach, after, afterEach, it
*/
/*jslint
this: true,
es6: true,
node: true
*/

"use strict";
const fs = require("fs");

var Scheduler = require("../index").Scheduler;
var http = require("http");

var TaskHealthHelper = require("../lib/taskHealthHelper");

// Testing require
var expect = require('chai').expect;
var sinon = require("sinon");
var MockReq = require("mock-req");
var MockRes = require("mock-res");

describe("Vault Health Checker", function () {
    var sandbox;
    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });
    afterEach(function () {
        sandbox.restore();
    });
    it("No tasks no URL (fail)", function () {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        try {
            healthCheck = new TaskHealthHelper(scheduler, {});
        } catch (error) {
            expect(error).to.be.an.error;
        }
        expect(healthCheck).to.be.undefined;
    });
    it("No tasks default options", function () {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck = new TaskHealthHelper(scheduler, {url: "/v1/sys/health?standbyok"});
        this.checkInstance = sandbox.stub(healthCheck, "checkRunningInstances");
        healthCheck.setupHealthCheck();
        expect(this.checkInstance.called).to.be.false;
        clearInterval(healthCheck.interval);
    });
    it("No tasks, no new default options", function () {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck = TaskHealthHelper(scheduler, {url: "/v1/sys/health?standbyok"});
        expect(healthCheck).to.be.an("object");
    });
    it("No tasks short interval", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var self = this;
        scheduler.on("ready", function() {
            healthCheck = new TaskHealthHelper(scheduler, {url: "/v1/sys/health?standbyok", "interval": 0.2});
            self.checkInstance = sandbox.stub(healthCheck, "checkRunningInstances");
            healthCheck.setupHealthCheck();
        });
        setTimeout(function() {
            expect(self.checkInstance.called).to.be.true;
            expect(self.checkInstance.callCount).to.be.at.least(2);
            clearInterval(healthCheck.interval);
            done();
        }, 600);
    });
    it("Setup and stop", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var self = this;
        scheduler.on("ready", function() {
            healthCheck = new TaskHealthHelper(scheduler, {url: "/v1/sys/health?standbyok", "interval": 0.2});
            self.checkInstance = sandbox.stub(healthCheck, "checkRunningInstances");
            healthCheck.setupHealthCheck();
            healthCheck.stopHealthCheck();
        });
        setTimeout(function() {
            expect(self.checkInstance.called).to.be.false;
            done();
        }, 400);
    });
    it("Stop no setup", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var self = this;
        scheduler.on("ready", function() {
            healthCheck = new TaskHealthHelper(scheduler, {url: "/v1/sys/health?standbyok", "interval": 0.2});
            self.checkInstance = sandbox.stub(healthCheck, "checkRunningInstances");
            healthCheck.stopHealthCheck();
        });
        setTimeout(function() {
            expect(self.checkInstance.called).to.be.false;
            done();
        }, 400);
    });
    it("Stop no setup", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var self = this;
        scheduler.on("ready", function() {
            healthCheck = new TaskHealthHelper(scheduler, {url: "/v1/sys/health?standbyok", "interval": 0.2});
            self.checkInstance = sandbox.stub(healthCheck, "checkRunningInstances");
            healthCheck.stopHealthCheck();
        });
        setTimeout(function() {
            expect(self.checkInstance.called).to.be.false;
            done();
        }, 400);
    });
    it("checkRunningInstances", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var self = this;
        scheduler.on("ready", function() {
            healthCheck = new TaskHealthHelper(scheduler, {url: "/v1/sys/health?standbyok"});
            self.checkInstance = sandbox.stub(healthCheck, "checkInstance");
            scheduler.launchedTasks = [{task:"name"},{task:"name2"}];
            healthCheck.checkRunningInstances();
            expect(self.checkInstance.called).to.be.true;
            expect(self.checkInstance.callCount).to.be.equal(2);
            done();
        });
    });
    it("checkRunningInstances - prefix", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var self = this;
        scheduler.on("ready", function() {
            healthCheck = new TaskHealthHelper(scheduler, {"propertyPrefix": "me", url: "/v1/sys/health?standbyok"});
            self.checkInstance = sandbox.stub(healthCheck, "checkInstance");
            scheduler.launchedTasks = [{task:"name"},{task:"name2"}];
            healthCheck.checkRunningInstances();
            expect(self.checkInstance.called).to.be.true;
            expect(self.checkInstance.callCount).to.be.equal(2);
            done();
        });
    });
    it("checkInstance pass", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var self = this;
        var res = new MockRes();
        var req = new MockReq({method: "GET"});
        var task = {"name": "vault-35", "runtimeInfo": {"state": "TASK_RUNNING", "network": {"hostname": "task1", "ports": ["23142"]}}};
        self.httpRequest = sandbox.stub(http, "request");
        this.httpRequest.callsArgWith(1, res).returns(req);
        scheduler.on("ready", function() {
            healthCheck = new TaskHealthHelper(scheduler, {"additionalProperties": [{"name": "sealed", "inverse": false}], url: "/v1/sys/health?standbyok", "taskNameFilter": "^vault-[0-9]+$"});
            self.healthRequestCreate = sandbox.stub(healthCheck, "healthRequestCreate");
            self.setCheckFailed = sandbox.stub(healthCheck, "setCheckFailed");
            healthCheck.checkInstance(task);
            expect(self.healthRequestCreate.called).to.be.true;
            expect(self.healthRequestCreate.callCount).to.be.equal(1);
            expect(task.runtimeInfo.checkFailCount).to.be.equal(0);
            expect(task.runtimeInfo.healthy).to.be.true;
            expect(task.runtimeInfo.sealed).to.be.true;
            done();
        });
    });
    it("checkInstance pass - property inverse", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var self = this;
        var res = new MockRes();
        var req = new MockReq({method: "GET"});
        var task = {"name": "vault-35", "runtimeInfo": {"state": "TASK_RUNNING", "network": {"hostname": "task1", "ports": ["23142"]}}};
        self.httpRequest = sandbox.stub(http, "request");
        this.httpRequest.callsArgWith(1, res).returns(req);
        scheduler.on("ready", function() {
            healthCheck = new TaskHealthHelper(scheduler, {"additionalProperties": [{"name": "sealed", "inverse": true}], url: "/v1/sys/health?standbyok", "taskNameFilter": "^vault-[0-9]+$"});
            self.healthRequestCreate = sandbox.stub(healthCheck, "healthRequestCreate");
            self.setCheckFailed = sandbox.stub(healthCheck, "setCheckFailed");
            healthCheck.checkInstance(task);
            expect(self.healthRequestCreate.called).to.be.true;
            expect(self.healthRequestCreate.callCount).to.be.equal(1);
            expect(task.runtimeInfo.checkFailCount).to.be.equal(0);
            expect(task.runtimeInfo.healthy).to.be.true;
            expect(task.runtimeInfo.sealed).to.be.false;
            done();
        });
    });
    it("checkInstance pass - property inverse - with prefix ", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var self = this;
        var res = new MockRes();
        var req = new MockReq({method: "GET"});
        var task = {"name": "vault-35", "runtimeInfo": {"state": "TASK_RUNNING", "network": {"hostname": "task1", "ports": ["23142"]}}};
        self.httpRequest = sandbox.stub(http, "request");
        this.httpRequest.callsArgWith(1, res).returns(req);
        scheduler.on("ready", function() {
            healthCheck = new TaskHealthHelper(scheduler, {"propertyPrefix": "me", "additionalProperties": [{"name": "sealed", "inverse": true}], url: "/v1/sys/health?standbyok", "taskNameFilter": "^vault-[0-9]+$"});
            self.healthRequestCreate = sandbox.stub(healthCheck, "healthRequestCreate");
            self.setCheckFailed = sandbox.stub(healthCheck, "setCheckFailed");
            healthCheck.checkInstance(task);
            expect(self.healthRequestCreate.called).to.be.true;
            expect(self.healthRequestCreate.callCount).to.be.equal(1);
            expect(task.runtimeInfo.mecheckFailCount).to.be.equal(0);
            expect(task.runtimeInfo.mehealthy).to.be.true;
            expect(task.runtimeInfo.checkFailCount).to.be.an("undefined");
            expect(task.runtimeInfo.healthy).to.be.an("undefined");
            expect(task.runtimeInfo.sealed).to.be.false;
            done();
        });
    });
    it("checkInstance invalid task state", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var self = this;
        var res = new MockRes();
        var req = new MockReq({ method: "GET" });
        var task = {"runtimeInfo":{"state": "TASK_STAGING", "network":{"hostname": "task1","ports":["23142"]}}};
        self.httpRequest = sandbox.stub(http, "request");
        this.httpRequest.callsArgWith(1, res).returns(req);
        scheduler.on("ready", function() {
            healthCheck = new TaskHealthHelper(scheduler, {url: "/v1/sys/health?standbyok"});
            self.healthRequestCreate = sandbox.stub(healthCheck, "healthRequestCreate");
            self.setCheckFailed = sandbox.stub(healthCheck, "setCheckFailed");
            healthCheck.checkInstance(task);
            expect(self.healthRequestCreate.called).to.be.false;
            expect(self.healthRequestCreate.callCount).to.be.equal(0);
            expect(task.runtimeInfo.checkFailCount).to.be.an("undefined");
            expect(task.runtimeInfo.healthy).to.be.an("undefined");
            done();
        });
    });
    it("checkInstance invalid task - missing hostname", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var self = this;
        var res = new MockRes();
        var req = new MockReq({ method: "GET" });
        var task = {"runtimeInfo":{"state": "TASK_RUNNING", "network":{"ports":["23142"]}}};
        self.httpRequest = sandbox.stub(http, "request");
        this.httpRequest.callsArgWith(1, res).returns(req);
        scheduler.on("ready", function() {
            healthCheck = new TaskHealthHelper(scheduler, {url: "/v1/sys/health?standbyok"});
            self.healthRequestCreate = sandbox.stub(healthCheck, "healthRequestCreate");
            self.setCheckFailed = sandbox.stub(healthCheck, "setCheckFailed");
            healthCheck.checkInstance(task);
            expect(self.healthRequestCreate.called).to.be.false;
            expect(self.healthRequestCreate.callCount).to.be.equal(0);
            expect(task.runtimeInfo.checkFailCount).to.be.an("undefined");
            expect(task.runtimeInfo.healthy).to.be.an("undefined");
            done();
        });
    });
    it("checkInstance http 500", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var self = this;
        var res = new MockRes();
        res.writeHead(500);
        var req = new MockReq({ method: "GET" });
        var task = {"runtimeInfo":{"state": "TASK_RUNNING", "network":{"hostname": "task1","ports":["23142"]}}};
        self.httpRequest = sandbox.stub(http, "request");
        this.httpRequest.callsArgWith(1, res).returns(req);
        scheduler.on("ready", function() {
            healthCheck = new TaskHealthHelper(scheduler, {url: "/v1/sys/health?standbyok"});
            self.healthRequestCreate = sandbox.stub(healthCheck, "healthRequestCreate");
            self.setCheckFailed = sandbox.stub(healthCheck, "setCheckFailed");
            healthCheck.checkInstance(task);
            expect(self.healthRequestCreate.called).to.be.true;
            expect(self.setCheckFailed.called).to.be.true;
            expect(self.setCheckFailed.callCount).to.be.equal(1);
            expect(self.healthRequestCreate.callCount).to.be.equal(1);
            expect(task.runtimeInfo.checkFailCount).to.be.an("undefined");
            expect(task.runtimeInfo.healthy).to.be.an("undefined");
            done();
        });
    });
    it("checkInstance connection error", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var self = this;
        var req = new MockReq({ method: "GET" });
        var task = {"runtimeInfo":{"state": "TASK_RUNNING", "network":{"hostname": "task1","ports":["23142"]}}};
        self.httpRequest = sandbox.stub(http, "request");
        this.httpRequest.returns(req);
        scheduler.on("ready", function () {
            healthCheck = new TaskHealthHelper(scheduler, {url: "/v1/sys/health?standbyok"});
            self.healthRequestCreate = sandbox.stub(healthCheck, "healthRequestCreate");
            self.setCheckFailed = sandbox.stub(healthCheck, "setCheckFailed");
            healthCheck.checkInstance(task);
            req.emit("error", new Error());
            expect(self.healthRequestCreate.called).to.be.true;
            expect(self.setCheckFailed.called).to.be.true;
            expect(self.setCheckFailed.callCount).to.be.equal(1);
            expect(self.healthRequestCreate.callCount).to.be.equal(1);
            expect(task.runtimeInfo.checkFailCount).to.be.an("undefined");
            expect(task.runtimeInfo.healthy).to.be.an("undefined");
            done();
        });
    });
    it("checkInstance connection error - prefix", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var self = this;
        var req = new MockReq({ method: "GET" });
        var task = {"runtimeInfo":{"state": "TASK_RUNNING", "network":{"hostname": "task1","ports":["23142"]}}};
        self.httpRequest = sandbox.stub(http, "request");
        this.httpRequest.returns(req);
        scheduler.on("ready", function () {
            healthCheck = new TaskHealthHelper(scheduler, {"propertyPrefix": "me", url: "/v1/sys/health?standbyok"});
            self.healthRequestCreate = sandbox.stub(healthCheck, "healthRequestCreate");
            self.setCheckFailed = sandbox.stub(healthCheck, "setCheckFailed");
            healthCheck.checkInstance(task);
            req.emit("error", new Error());
            expect(self.healthRequestCreate.called).to.be.true;
            expect(self.setCheckFailed.called).to.be.true;
            expect(self.setCheckFailed.callCount).to.be.equal(1);
            expect(self.healthRequestCreate.callCount).to.be.equal(1);
            expect(task.runtimeInfo.checkFailCount).to.be.an("undefined");
            expect(task.runtimeInfo.healthy).to.be.an("undefined");
            done();
        });
    });
    it("checkInstance - prefix body check fail", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var self = this;
        var req = new MockReq({method: "GET"});
        var res = new MockRes();
        var task = {"runtimeInfo": {"state": "TASK_RUNNING", "network": {"hostname": "task1", "ports": ["23142"]}}};
        self.httpRequest = sandbox.stub(http, "request");
        this.httpRequest.callsArgWith(1, res).returns(req);
        var check = function () {
            return false;
        };
        scheduler.on("ready", function () {
            healthCheck = new TaskHealthHelper(scheduler, {"propertyPrefix": "me", "checkBodyFunction": check, url: "/v1/sys/health?standbyok"});
            self.healthRequestCreate = sandbox.stub(healthCheck, "healthRequestCreate");
            self.setCheckFailed = sandbox.stub(healthCheck, "setCheckFailed", function () {
                expect(self.setCheckFailed.called).to.be.true;
                expect(self.setCheckFailed.callCount).to.be.equal(1);
                expect(self.healthRequestCreate.callCount).to.be.equal(1);
                expect(task.runtimeInfo.checkFailCount).to.be.an("undefined");
                expect(task.runtimeInfo.healthy).to.be.an("undefined");
                expect(task.runtimeInfo.mehealthy).to.be.an("undefined");
                done();
            });
            healthCheck.checkInstance(task);
            expect(self.healthRequestCreate.called).to.be.true;
        });
        res.write("fdsfdsfsd");
        res.write("dsfdsfsd");
        res.end();
    });
    it("checkInstance - no prefix body check fail", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var self = this;
        var req = new MockReq({method: "GET"});
        var res = new MockRes();
        var task = {"runtimeInfo": {"state": "TASK_RUNNING", "network": {"hostname": "task1", "ports": ["23142"]}}};
        self.httpRequest = sandbox.stub(http, "request");
        this.httpRequest.callsArgWith(1, res).returns(req);
        var check = function () {
            return false;
        };
        scheduler.on("ready", function () {
            healthCheck = new TaskHealthHelper(scheduler, {"checkBodyFunction": check, url: "/v1/sys/health?standbyok"});
            self.healthRequestCreate = sandbox.stub(healthCheck, "healthRequestCreate");
            self.setCheckFailed = sandbox.stub(healthCheck, "setCheckFailed", function () {
                expect(self.setCheckFailed.called).to.be.true;
                expect(self.setCheckFailed.callCount).to.be.equal(1);
                expect(self.healthRequestCreate.callCount).to.be.equal(1);
                expect(task.runtimeInfo.checkFailCount).to.be.an("undefined");
                expect(task.runtimeInfo.healthy).to.be.an("undefined");
                done();
            });
            healthCheck.checkInstance(task);
            expect(self.healthRequestCreate.called).to.be.true;
        });
        res.write("fdsfdsfsd");
        res.write("dsfdsfsd");
        res.end();
    });
    it("checkInstance - prefix body check pass", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var self = this;
        var req = new MockReq({method: "GET"});
        var res = new MockRes();
        var task = {"runtimeInfo": {"state": "TASK_RUNNING", "network": {"hostname": "task1", "ports": ["23142"]}}};
        self.httpRequest = sandbox.stub(http, "request");
        this.httpRequest.callsArgWith(1, res).returns(req);
        var check = function () {
            return true;
        };
        scheduler.on("ready", function () {
            healthCheck = new TaskHealthHelper(scheduler, {"propertyPrefix": "me", "checkBodyFunction": check, url: "/v1/sys/health?standbyok"});
            self.healthRequestCreate = sandbox.stub(healthCheck, "healthRequestCreate");
            self.setProperties = sandbox.stub(healthCheck, "setProperties", function (taskToSet, value) {
                expect(self.setProperties.called).to.be.true;
                expect(self.setProperties.callCount).to.be.equal(1);
                expect(value).to.be.true;
                expect(taskToSet).to.deep.equal(task);
                expect(self.healthRequestCreate.callCount).to.be.equal(1);
                expect(task.runtimeInfo.mecheckFailCount).to.equal(0);
                expect(task.runtimeInfo.mehealthy).to.equal(true);
                expect(task.runtimeInfo.checkFailCount).to.be.an("undefined");
                expect(task.runtimeInfo.healthy).to.be.an("undefined");
                done();
            });
            task.runtimeInfo.mecheckFailCount = 3;
            expect(task.runtimeInfo.mecheckFailCount).to.equal(3);
            healthCheck.checkInstance(task);
            expect(self.healthRequestCreate.called).to.be.true;
        });
        res.write("fdsfdsfsd");
        res.write("dsfdsfsd");
        res.end();
    });
    it("setCheckFailed - once on new task", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var task = {"runtimeInfo":{"state": "TASK_RUNNING", "network":{"hostname": "task1","ports":["23142"]}}};
        scheduler.on("ready", function () {
            healthCheck = new TaskHealthHelper(scheduler, {url: "/v1/sys/health?standbyok"});
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.checkFailCount).to.be.equal(1);
            expect(task.runtimeInfo.healthy).to.be.an("undefined");
            done();
        });
    });
    it("setCheckFailed - 3 times on new task", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var task = {"runtimeInfo":{"state": "TASK_RUNNING", "network":{"hostname": "task1","ports":["23142"]}}};
        var emitted = false;
        scheduler.on("ready", function () {
            healthCheck = new TaskHealthHelper(scheduler, {url: "/v1/sys/health?standbyok"});
            scheduler.on("task_unhealthy", function (task) {
                emitted = true;
            });
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.checkFailCount).to.be.equal(1);
            expect(task.runtimeInfo.healthy).to.be.an("undefined");
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.checkFailCount).to.be.equal(2);
            expect(task.runtimeInfo.healthy).to.be.an("undefined");
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.checkFailCount).to.be.equal(3);
            expect(task.runtimeInfo.healthy).to.be.an("undefined");
            expect(emitted).to.be.false;
            done();
        });
    });
    it("setCheckFailed - 4 times on new task - no setUnhealthy", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var task = {"runtimeInfo":{"state": "TASK_RUNNING", "network":{"hostname": "task1","ports":["23142"]}}};
        var emitted = false;
        scheduler.on("ready", function() {
            healthCheck = new TaskHealthHelper(scheduler, {"additionalProperties": [{"name": "sealed", "inverse": true}], url: "/v1/sys/health?standbyok"});
            scheduler.on("task_unhealthy", function (task) {
                emitted = true;
            });
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.checkFailCount).to.be.equal(1);
            expect(task.runtimeInfo.healthy).to.be.an("undefined");
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.checkFailCount).to.be.equal(2);
            expect(task.runtimeInfo.healthy).to.be.an("undefined");
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.checkFailCount).to.be.equal(3);
            expect(task.runtimeInfo.healthy).to.be.an("undefined");
            expect(emitted).to.be.false;
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.checkFailCount).to.be.equal(4);
            expect(task.runtimeInfo.healthy).to.be.false;
            expect(task.runtimeInfo.sealed).to.be.undefined;
            expect(emitted).to.be.true;
            done();
        });
    });
    it("setCheckFailed - 4 times on new task", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var task = {"runtimeInfo":{"state": "TASK_RUNNING", "network":{"hostname": "task1","ports":["23142"]}}};
        var emitted = false;
        scheduler.on("ready", function() {
            healthCheck = new TaskHealthHelper(scheduler, {"additionalProperties": [{"setUnhealthy": true, "name": "sealed", "inverse": true}], url: "/v1/sys/health?standbyok"});
            scheduler.on("task_unhealthy", function (task) {
                emitted = true;
            });
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.checkFailCount).to.be.equal(1);
            expect(task.runtimeInfo.healthy).to.be.an("undefined");
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.checkFailCount).to.be.equal(2);
            expect(task.runtimeInfo.healthy).to.be.an("undefined");
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.checkFailCount).to.be.equal(3);
            expect(task.runtimeInfo.healthy).to.be.an("undefined");
            expect(emitted).to.be.false;
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.checkFailCount).to.be.equal(4);
            expect(task.runtimeInfo.healthy).to.be.false;
            expect(task.runtimeInfo.sealed).to.be.true;
            expect(emitted).to.be.true;
            done();
        });
    });
    it("setCheckFailed - 4 times on new task - prefix", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var task = {"runtimeInfo":{"state": "TASK_RUNNING", "network":{"hostname": "task1","ports":["23142"]}}};
        var emitted = false;
        scheduler.on("ready", function() {
            healthCheck = new TaskHealthHelper(scheduler, {"propertyPrefix": "me", "additionalProperties": [{"setUnhealthy": true, "name": "sealed", "inverse": true}], url: "/v1/sys/health?standbyok"});
            scheduler.on("metask_unhealthy", function (task) {
                emitted = true;
            });
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.mecheckFailCount).to.be.equal(1);
            expect(task.runtimeInfo.mehealthy).to.be.an("undefined");
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.mecheckFailCount).to.be.equal(2);
            expect(task.runtimeInfo.mehealthy).to.be.an("undefined");
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.mecheckFailCount).to.be.equal(3);
            expect(task.runtimeInfo.mehealthy).to.be.an("undefined");
            expect(emitted).to.be.false;
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.mecheckFailCount).to.be.equal(4);
            expect(task.runtimeInfo.mehealthy).to.be.false;
            expect(task.runtimeInfo.checkFailCount).to.be.an("undefined");
            expect(task.runtimeInfo.healthy).to.be.an("undefined");
            expect(task.runtimeInfo.sealed).to.be.true;
            expect(emitted).to.be.true;
            done();
        });
    });
    it("setCheckFailed - 5 times on new task", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var task = {"runtimeInfo":{"state": "TASK_RUNNING", "network":{"hostname": "task1","ports":["23142"]}}};
        var emitted = 0;
        scheduler.on("ready", function() {
            healthCheck = new TaskHealthHelper(scheduler, {"additionalProperties": [{"setUnhealthy": true, "name": "sealed", "inverse": false}], url: "/v1/sys/health?standbyok"});
            scheduler.on("task_unhealthy", function (task) {
                emitted += 1;
            });
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.checkFailCount).to.be.equal(1);
            expect(task.runtimeInfo.healthy).to.be.an("undefined");
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.checkFailCount).to.be.equal(2);
            expect(task.runtimeInfo.healthy).to.be.an("undefined");
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.checkFailCount).to.be.equal(3);
            expect(task.runtimeInfo.healthy).to.be.an("undefined");
            expect(emitted).to.be.equal(0);
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.checkFailCount).to.be.equal(4);
            expect(task.runtimeInfo.healthy).to.be.false;
            expect(emitted).to.equal(1);
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.checkFailCount).to.be.equal(5);
            expect(task.runtimeInfo.healthy).to.be.false;
            expect(task.runtimeInfo.sealed).to.be.false;
            expect(emitted).to.equal(2);
            done();
        });
    });
    it("setCheckFailed - 5 times on new task - prefix", function (done) {
        var scheduler = new Scheduler({useZk: false, logging: {level: "debug"}, "frameworkName": "testFramework"});
        var healthCheck;
        var task = {"runtimeInfo":{"state": "TASK_RUNNING", "network":{"hostname": "task1","ports":["23142"]}}};
        var emitted = 0;
        scheduler.on("ready", function() {
            healthCheck = new TaskHealthHelper(scheduler, {"propertyPrefix": "me", "additionalProperties": [{"setUnhealthy": true, "name": "sealed", "inverse": false}], url: "/v1/sys/health?standbyok"});
            scheduler.on("metask_unhealthy", function (task) {
                emitted += 1;
            });
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.mecheckFailCount).to.be.equal(1);
            expect(task.runtimeInfo.mehealthy).to.be.an("undefined");
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.mecheckFailCount).to.be.equal(2);
            expect(task.runtimeInfo.mehealthy).to.be.an("undefined");
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.mecheckFailCount).to.be.equal(3);
            expect(task.runtimeInfo.mehealthy).to.be.an("undefined");
            expect(emitted).to.be.equal(0);
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.mecheckFailCount).to.be.equal(4);
            expect(task.runtimeInfo.mehealthy).to.be.false;
            expect(emitted).to.equal(1);
            healthCheck.setCheckFailed(task);
            expect(task.runtimeInfo.mecheckFailCount).to.be.equal(5);
            expect(task.runtimeInfo.mehealthy).to.be.false;
            expect(task.runtimeInfo.sealed).to.be.false;
            expect(task.runtimeInfo.checkFailCount).to.be.an("undefined");
            expect(task.runtimeInfo.healthy).to.be.an("undefined");
            expect(emitted).to.equal(2);
            done();
        });
    });
    it("healthRequestCreate", function () {
        var scheduler = {};
        var healthCheck;
        var task = {"runtimeInfo":{"state": "TASK_RUNNING", "network":{"hostname": "task1","ports":["23142"]}}};

        healthCheck = new TaskHealthHelper(scheduler, {url: "/v1/sys/health?standbyok"});

        var template = healthCheck.healthRequestCreate(task.runtimeInfo.network.hostname, task.runtimeInfo.network.ports[0]);
        expect(task.runtimeInfo.network.hostname).to.be.equal(template.host);
        expect(task.runtimeInfo.network.ports[0]).to.be.equal(template.port);
        expect(template.method).to.be.equal("GET");

    });
});
