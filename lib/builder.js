"use strict";

var path = require("path");
var protoBuf = require("protobufjs");

// Load Mesos protobuf definitions
var builder = protoBuf.loadProtoFile(path.join(__dirname, "../", "proto/all.proto"));

/**
 * Represents a variable builder for protobuf to JavaScript instantiations.
 * @constructor
 * @param {string} messageType - The message type as string, e.g. `mesos.HealthCheck`.
 */
function Builder (messageType) {

    if (!(this instanceof Builder)) {
        return new Builder(messageType);
    } else {
        return new (builder.build(messageType))();
    }

}

module.exports = Builder;
