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

describe('Task helper constructor', function() {
    it('Create TaskHelper based on scheduler instance', function () {
        var scheduler = Scheduler({});
        expect(scheduler).to.be.instanceOf(Scheduler);
        var taskHelper = TaskHelper(scheduler);
        expect(taskHelper.scheduler).to.be.instanceOf(Scheduler);
        expect(taskHelper.scheduler).to.deep.equal(scheduler);
    });

});
describe('Load tasks from Zk', function() {
    it('ZK is down', function () {
       var scheduler = Scheduler({});
       var taskHelper = TaskHelper(scheduler);

        before(function () {
            sandbox = sinon.sandbox.create();
            sandbox.stub(zkClient, "connect", function() {
                this.emit("connected");
            });
            sandbox.stub(zkClient, "getChildren", function() {
                return new Error('couldn\'t get children');
            });
        });

        taskHelper.loadTasks();



    });

});