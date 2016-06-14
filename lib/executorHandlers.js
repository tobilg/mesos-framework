"use strict";
var uuid = require('uuid');

var helpers = require("./helpers");
var Mesos = new (require("./mesos"))();

var mesos = Mesos.getMesos();
var builder = Mesos.getBuilder();

module.exports = {
    "SUBSCRIBED": function (subscribed) {
    },
    "LAUNCH": function (launched) {
    },
    "KILL": function (killed) {
    },
    "ACKNOWLEDGED": function (acknowledged) {
    },
    "MESSAGE": function (message) {
    },
    "ERROR": function (error) {
    },
    "SHUTDOWN": function (shutdown) {
    }
};
