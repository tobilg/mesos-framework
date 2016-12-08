var helpers = require("../lib/helpers");

var expect = require('chai').expect;

describe('helpers', function() {
    it('Test the CloneDeep helper', function () {
        var objects = [{ 'a': 1 }, { 'b': 2 }];
 
        var deep = helpers.cloneDeep(objects);
        expect(deep[0] === objects[0]).to.be.false;
    });
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
});