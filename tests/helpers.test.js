var helpers = require("../lib/helpers");
var mesos = require("../lib/mesos")().getMesos();

var expect = require('chai').expect;

describe('helpers', function() {
    it('Test the CloneDeep helper', function () {
        var objects = [{ 'a': 1 }, { 'b': 2 }];
 
        var deep = helpers.cloneDeep(objects);
        expect(deep[0] === objects[0]).to.be.false;
    });
    describe("sortTasksByPriority", function () {
        it('Sort the task array with 2 submitted tasks', function () {
            var tasks = helpers.sortTasksByPriority({
                    task1:{isSubmitted:true},
                    task2:{isSubmitted:true}});
            expect(tasks).to.be.an('array');
            expect(tasks).to.have.lengthOf(2);
        });
        it('Sort the task array with 3 submitted tasks with priority', function () {
            var tasks = helpers.sortTasksByPriority({
                    task1:{isSubmitted:true, priority:1},
                    task2:{isSubmitted:true, priority:2},
                    task3:{isSubmitted:true, priority:1}
                });
            expect(tasks).to.be.an('array');
            expect(tasks).to.have.lengthOf(3);
        });
        it('Sort the task array with 3 submitted tasks with priority and multiple instances', function () {
            var tasks = helpers.sortTasksByPriority({
                    task1:{isSubmitted:true, priority:1},
                    task2:{isSubmitted:true, priority:2},
                    task3:{isSubmitted:true, priority:1, instances:2}
                });
            expect(tasks).to.be.an('array');
            expect(tasks).to.have.lengthOf(4);
        });
        it.skip('Sort the task array with 3 submitted tasks with priority and out of order names', function () {
            var tasks = helpers.sortTasksByPriority({
                    task3:{isSubmitted:true, priority:1},
                    task2:{isSubmitted:true, priority:2},
                    task1:{isSubmitted:true, priority:1}
                });
            expect(tasks).to.be.an('array');
            expect(tasks).to.have.lengthOf(3);
            expect(tasks[0].name).to.equal("task1-1");
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
});