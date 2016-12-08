var Scheduler = require("../").Scheduler;

var expect = require('chai').expect;

describe('Scheduler', function() {
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
    it('Create the Scheduler with a submitted task', function () {
        var scheduler = Scheduler({tasks: {task1:{isSubmitted:true}}});
        expect(scheduler).to.be.instanceOf(Scheduler);
        expect(scheduler.tasks).to.be.an('array');
        expect(scheduler.tasks).to.have.lengthOf(1);
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
    describe('generateRequestTemplate', function() {
        it('creates the request template', function * () {
            expect(Scheduler).to.be.calledWith();
            expect(generateRequestTemplate).to.be.calledWith();
        });
    });
});