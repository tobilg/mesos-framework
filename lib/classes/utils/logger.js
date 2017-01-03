"use strict";

const winston = require("winston");

class Logger {

    constructor(path, fileName, logLevel) {

        this.loggerInstance = new (winston.Logger)({
            transports: [
                new (winston.transports.Console)({ level: logLevel || "info" }),
                new (require("winston-daily-rotate-file"))({
                    filename: (path && fileName ? path + "/" + fileName : "logs/mesos-framework.log"),
                    level: logLevel || "info",
                    prepend: true,
                    json: false
                })
            ]
        });

    }

    get() {
        return this.loggerInstance;
    }

}

module.exports = Logger;