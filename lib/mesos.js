"use strict";

var protoBuf = require("protobufjs");

// Load Mesos protobuf definitions
var builder = protoBuf.loadProtoFile("proto/all.proto");

// Instantiate protobuf definitions
var mesos = builder.build("mesos");

/**
 * The Mesos protocol buffers helper
 * @returns {object} An object with the Mesos protocol buffer definitions
 * @constructor
 */
function Mesos () {

    if (!(this instanceof Mesos)) {
        return new Mesos();
    }

}

/**
 *
 * @returns {Mesos}
 */
Mesos.prototype.getMesos = function () {
    return mesos;
};

/**
 * Get a ProtoBuf.Builder instance
 * @returns {?ProtoBuf.Builder|undefined|ProtoBuf.Builder} A ProtoBuf.Builder instance
 */
Mesos.prototype.getBuilder = function () {
    return builder;
};

/**
 * Get a reference to the protobuf.js module
 * @returns {function} A reference to the protobuf.js module
 */
Mesos.prototype.getProtoBuf = function () {
    return protoBuf;
};

module.exports = Mesos;
