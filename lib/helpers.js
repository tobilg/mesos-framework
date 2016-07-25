"use strict";

var http = require("http");
var path = require("path");
var _ = require('lodash');
var winston = require('winston');

module.exports = {

    getLogger: function(path, fileName, logLevel) {

        var logger = new (winston.Logger)({
            transports: [
                new (winston.transports.Console)({ level: logLevel || "info" }),
                new (require("winston-daily-rotate-file"))({
                    filename: (path && fileName ? path + "/" + fileName : "logs/mesos-framework.log"),
                    level: logLevel || "info",
                    prepend: true
                })
            ]
        });

        return logger;

    },

    cloneDeep: function(obj) {
        return _.cloneDeep(obj);
    },

    sortTasksByPriority: function (tasks) {

        //TODO: Change implementation to reflect missing priorities -> Sort by task name instead.
        function prioSort(a,b) {
            if (a.priority < b.priority)
                return -1;
            if (a.priority > b.priority)
                return 1;
            return 0;
        }

        var tasksArray = [];

        Object.getOwnPropertyNames(tasks).forEach(function (task) {

            var instances = tasks[task].instances || 1;

            // Add to tasks array
            for (var i = 1; i <= instances; i++) {
                // Set defaults
                tasks[task].isSubmitted = false;
                tasks[task].name = task;
                if (!tasks[task].hasOwnProperty("allowScaling")) {
                    tasks[task].allowScaling = false;
                }
                tasksArray.push(_.cloneDeep(tasks[task])); // Important!
            }

        });

        return tasksArray.sort(prioSort);

    },

    doRequest: function (payload, callback) {

        var self = this;

        // Add mesos-stream-id to header
        if (self.mesosStreamId) {
            self.requestTemplate.headers["mesos-stream-id"] = self.mesosStreamId;
        }

        var req = http.request(self.requestTemplate, function (res) {

            // Set encoding
            res.setEncoding('utf8');

            // Buffer for the response body
            var body = "";

            res.on('data', function (chunk) {
                body += chunk;
            });

            // Watch for errors of the request
            res.on('error', function (e) {
                callback({ message: "There was a problem with the response: " + e.message }, null);
            });

            res.on('end', function () {
                if (res.statusCode !== 202) {
                    callback({ message: "Request was not accepted properly. Reponse status code was '" + res.statusCode + "'. Body was '" + body + "'." }, null);
                } else {
                    callback(null, { statusCode: res.statusCode, body: body });
                }
            });

        });

        // Watch for errors of the request
        req.on('error', function (e) {
            callback({ message: "There was a problem with the request: " + e.message }, null);
        });

        // Write data to request body
        req.write(JSON.stringify(payload));

        // End request
        req.end();

    },
    stringifyEnums: function (message) {
        _.forEach(message.$type.children, function(child) {
            var type = _.get(child, 'element.resolvedType', null);
            if (type && type.className === 'Enum' && type.children) {
                var metaValue = _.find(type.children, {
                    id: message[child.name]
                });
                if (metaValue && metaValue.name)
                // Alternatively you can do something like:
                // message[child.name + '_string'] = metaValue.name;
                // To get access to both the raw value and the string.
                    message[child.name] = metaValue.name;
            }
        });
        return message;
    },
    stringifyEnumsRecursive: function (message) {
        var self = this;
        message = self.stringifyEnums(message);
        _.forEach(message, function(subMessage, key) {
            if (_.isObject(subMessage) && subMessage.$type) {
                message[key] = self.stringifyEnumsRecursive(message[key]);}
        });
        return message;
    },
    isFunction: function(obj) {
        return !!(obj && obj.constructor && obj.call && obj.apply);
    }

};