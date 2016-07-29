# mesos-framework

This project provides a low-level wrapper around the Mesos HTTP APIs for [schedulers](http://mesos.apache.org/documentation/latest/scheduler-http-api/) and [executors](http://mesos.apache.org/documentation/latest/executor-http-api/).
It can be used to write Mesos frameworks in pure JavaScript. The currently supported Mesos version is 0.28.2.

## Installation

You can use `mesos-framework` in your own projects by running

    npm i mesos-framework --save

## Documentation

The `mesos-framework` project is not a Mesos framework itself, but can be imagined as a "framework-framework" (or meta framework), meaning that it provides a certain abstraction around the HTTP APIs for schedulers and executors, together with some convenience methods.
 
It implements all existing `Calls` as methods for both the `Scheduler` and `Executor` classes, meaning that they can be used without having to write the HTTP communication yourself. Additionally, it exposes all `Events` for both classes, as definied in the Mesos docs. It also adds some custom events for the `Scheduler` class for better task handling.   

There are some basic event handler methods provided for the `Scheduler` class, which for example take care of the checking and accepting the offers received from the Mesos master, as well as keeping track of tasks. Please have a look at the class documentation in the `docs` folder of this project.

For both the `Scheduler` and `Executor` classes, the belonging event handler methods can be overwritten with custom logic. To do that, you can supply a `options.handlers` property map object (where the property name is the uppercase `Event` name) when instantiating a class:

```javascript
var scheduler = new Scheduler({
    ...
    "handlers": {
        "HEARTBEAT": function (timestamp) {
            console.log("CUSTOM HEARTBEAT!");
            this.lastHeartbeat = timestamp;
        }
    }
});
```

Basically this is the mechanism to create custom framework logic. Please have a look at the `examples` folder to see examples for command-based and Docker-based schedulers.

#### API docs

The API docs can be accessed via [this link](https://htmlpreview.github.io/?https://raw.githubusercontent.com/tobilg/mesos-framework/master/docs/index.html).

### Scheduler

The `Scheduler` is the "heart" of a Mesos framework. It is very well possible to create a Mesos framework only by implementing the `Scheduler` with the standard [CommandInfo](https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L397) and [ContainerInfo](https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L1744) objects.

The option properties you can specify to create a `Scheduler` are the following:

* `masterUrl`: The URL of the leading Mesos master (**mandatory**).
* `port`: The port of the leading Mesos master (**mandatory**).
* `frameworkName`: The desired framework name (will choose a standard name if not specified).
* `restartStates`: An array of [TaskStates](https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L1310) which should trigger a restart of a task. For example, regularly finished tasks (in state `TASK_FINISHED`) are not restarted by default.
* `masterConnectionTimeout`: The number of seconds to wait before a connection to the leading Mesos master is considered as timed out (default: `10`).
* `frameworkFailoverTimeout`: The number of seconds to wait before a framework is considered as `failed` by the leading Mesos master, which will then terminate the existing tasks/executors (default: `604800`).
* `tasks`: An object (map) with the task info (see below). It's possible to create different (prioritized) tasks, e.g. launching different containers with different instance counts. See the [Docker Scheduler example](https://github.com/tobilg/mesos-framework/blob/master/examples/dockerSchedulerBridgeNetworking.js).
* `handlers`: An object containing custom handler functions for the `Scheduler` events, where the property name is the uppercase `Event` name.

A `tasks` sub-object can contain objects with task information:

* `instances`: The number of instances (tasks) you want to launch (will be 1 if you don't specify this property).
* `priority`: The priority of which the different tasks shall be launched (lower is better). If none is specified, tasks will be launched based on the task naming.
* `allowScaling`: A boolean value which indicates whether this task permits scaling operations (default: `false`).
* `commandInfo`: A [Mesos.CommandInfo](https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L397) definition (**mandatory**).
* `containerInfo`: A [Mesos.ContainerInfo](https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L1744) definition.
* `executorInfo`: A [Mesos.ExecutorInfo](https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L460) definition.
* `resources`: The array of [Mesos.Resource](https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L641) definitions (**mandatory**).
* `portMappings`: The array of portMapping objects, each containing a numeric `port` value (for container ports), and a `protocol` string (either `tcp` or `udp`). 
* `healthChecks`: A [Mesos.HealthCheck](https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L302) definition.
* `labels`: A [Mesos.Labels](https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L1845) definition.

#### High availability

Currently, `mesos-framework` doesn't support HA setups for the scheduler instances, meaning that you can only run one instance at once. If you run the scheduler application via Marathon, you should be able to make use of the health checks to let them restart the scheduler applicaiton once it fails.
 
See also the example implementation of a framework at [mesos-framework-boilerplate](https://github.com/tobilg/mesos-framework-boilerplate).

`mesos-framework` has support for the detection of the leading master via Mesos DNS. You can use `leader.mesos` as the `masterUrl`, enabling that upon re-registration of the scheduler, the correct master address will be used (Mesos DNS lookup). If you just provided an IP address or a hostname, `mesos-framework` will try to establish a new connection to the given address and look for redirection information (the "leader change" case). If this request times out, there is no way to automatically determine the current leader, so the scheduler stops itsef (the "failed Master" case).

#### Events

**Events from Master**  
The following events from the leading Mesos master are exposed:

* `subscribed`: The first event sent by the master when the scheduler sends a `SUBSCRIBE` request on the persistent connection (i.e. the framework was started). Emits an object containing the `frameworkId` and the `mesosStreamId`. 
* `offers`: Sent by the master whenever there are new resources that can be offered to the framework. Emits the base object from the Master for this event.
* `rescind`: Sent by the master when a particular offer is no longer valid. Emits the base object from the Master for this event.
* `update`: Sent by the master whenever there is a status update that is generated by the executor, agent or master. Emits the base object from the Master for this event.
* `message`: A custom message generated by the executor that is forwarded to the scheduler by the master. Emits an object containing the `agentId`, the `executorId` and the ASCII-encoded `data`. 
* `heartbeat`: This event is periodically sent by the master to inform the scheduler that a connection is alive. Emits the timestamp of the last heartbeat event.
* `failure`: Sent by the master when an agent is removed from the cluster (e.g., failed health checks) or when an executor is terminated. Emits the base object from the Master for this event. 
* `error`: Sent by the master when an asynchronous error event is generated (e.g., a framework is not authorized to subscribe with the given role). Emits the base object from the Master for this event.

**Events from Scheduler**  
The following events from the Scheduler calls are exposed:

* `sent_subscribe`: Is emitted when the scheduler has sent the `SUBSCRIBE` request.
* `sent_accept`: Is emitted when the scheduler has sent an `ACCEPT` request to accept an offer from the Master.
* `sent_decline`: Is emitted when the scheduler has sent a `DECLINE` request to decline an offer from the Master.
* `sent_teardown`: Is emitted when the scheduler has sent the `TEARDOWN` request to stop the framework to the Master.
* `sent_revive`: Is emitted when the scheduler has sent a `REVIVE` request to the Master to remove any/all filters that it has previously set via `ACCEPT` or `DECLINE` calls.
* `sent_kill`: Is emitted when the scheduler has sent a `KILL` request to the Master to kill a specific task.
* `sent_acknowledge`: Is emitted when the scheduler has sent an `ACKNOWLEDGE` request to the Master to acknowledge a status update.
* `sent_shutdown`: Is emitted when the scheduler has sent a `SHUTDOWN` request to the Master to shutdown a specific custom executor.
* `sent_reconcile`: Is emitted when the scheduler has sent a `RECONCILE` request to the Master to query the status of non-terminal tasks.
* `sent_message`: Is emitted when the scheduler has sent a `MESSAGE` request to the Master to send arbitrary binary data to the executor.
* `sent_request`: Is emitted when the scheduler has sent a `REQUEST` request to the Master to request new resources.
* `updated_task`: Is emitted when a task was updated. Contains an object with `taskId`, `executorId` and `state`.  
* `removed_task`: Is emitted when a task was removed. Contains the `taskId`.

#### Example

Also, you can have a look at the `examples` folder to see examples for command-based and Docker-based schedulers.

```javascript
"use strict";

var Scheduler = require("mesos-framework").Scheduler;
var Mesos = require("mesos-framework").Mesos.getMesos();

var scheduler = new Scheduler({
    "masterUrl": "172.17.10.101", // If Mesos DNS is used this would be "leader.mesos", otherwise use the actual IP address of the leading master
    "port": 5050,
    "frameworkName": "My first Command framework",
    "logging": {
        "level": "debug" // Set log Level to debug (default is info)
    },
    "restartStates": ["TASK_FAILED", "TASK_KILLED", "TASK_LOST", "TASK_ERROR", "TASK_FINISHED"], // Overwrite the restartStates (by default, TASK_FINISHED tasks are NOT restarted!)
    "tasks": {
        "sleepProcesses": {
            "priority": 1,
            "instances": 3,
            "commandInfo": new Mesos.CommandInfo(
                null, // URI
                null, // Environment
                true, // Is shell?
                "sleep 10;", // Command
                null, // Arguments
                null // User
            ),
            "resources": {
                "cpus": 0.2,
                "mem": 128,
                "ports": 1,
                "disk": 0
            }
        }
    },
    "handlers": {
        "HEARTBEAT": function (timestamp) {
            this.logger.info("CUSTOM HEARTBEAT!");
            this.lastHeartbeat = timestamp;
        }
    }
});

// Start the main logic once the framework scheduler has received the "SUBSCRIBED" event from the leading Mesos master
scheduler.on("subscribed", function (obj) {

    // Display the Mesos-Stream-Id
    scheduler.logger.info("Mesos Stream Id is " + obj.mesosStreamId);

    // Display the framework id
    scheduler.logger.info("Framework Id is " + obj.frameworkId);

    // Trigger shutdown after one minute
    setTimeout(function() {
        // Send "TEARDOWN" request
        scheduler.teardown();
        // Shutdown process
        process.exit(0);
    }, 60000);

});

// Capture "offers" events
scheduler.on("offers", function (offers) {
    scheduler.logger.info("Got offers: " + JSON.stringify(offers));
});

// Capture "heartbeat" events
scheduler.on("heartbeat", function (heartbeatTimestamp) {
    scheduler.logger.info("Heartbeat on " + heartbeatTimestamp);
});

// Capture "error" events
scheduler.on("error", function (error) {
    scheduler.logger.info("ERROR: " + JSON.stringify(error));
    scheduler.logger.info(error.stack);
});

// Start framework scheduler
scheduler.subscribe();
```

### Executor

You should consider writing your own executors if your framework has special requirements. For example, you may not want a 1:1 relationship between tasks and processes.

How can the custom executors be used? Taken from the [Mesos framework development guide](http://mesos.apache.org/documentation/latest/app-framework-development-guide/):

> One way to distribute your framework executor is to let the Mesos fetcher download it on-demand when your scheduler launches tasks on that slave.
> [ExecutorInfo](https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L460) is a Protocol Buffer Message class, and it contains a field of type [CommandInfo](https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L397).
> [CommandInfo](https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L397) allows schedulers to specify, among other things, a number of resources as URIs.
> These resources are fetched to a sandbox directory on the slave before attempting to execute the [ExecutorInfo](https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L460) command.
> Several URI schemes are supported, including HTTP, FTP, HDFS, and S3.

> Alternatively, you can pass the `frameworks_home` configuration option (defaults to: `MESOS_HOME/frameworks`) to your mesos-slave daemons
> when you launch them to specify where your framework executors are stored (e.g. on an NFS mount that is available to all slaves),
> then use a relative path in `CommandInfo.uris`, and the slave will prepend the value of frameworks_home to the relative path provided.

#### Events

**Events from Scheduler**  
The following events from the Scheduler are exposed:

* `subscribed`: The first event sent by the agent when the executor sends a `SUBSCRIBE` request on the persistent connection.
* `launch`: Sent by the agent whenever it needs to assign a new task to the executor. The executor is required to send an `UPDATE` message back to the agent indicating the success or failure of the task initialization.
* `kill`: Is sent whenever the scheduler needs to stop execution of a specific task. The executor is required to send a terminal update (e.g., `TASK_FINISHED`, `TASK_KILLED` or `TASK_FAILED`) back to the agent once it has stopped/killed the task. Mesos will mark the task resources as freed once the terminal update is received.
* `acknowledged`: Sent to signal the executor that a status update was received as part of the reliable message passing mechanism. Acknowledged updates must not be retried.
* `message`: Sent a custom message generated by the scheduler and forwarded all the way to the executor. These messages are delivered “as-is” by Mesos and have no delivery guarantees. It is up to the scheduler to retry if a message is dropped for any reason.
* `shutdown`: Sent by the agent in order to shutdown the executor. Once an executor gets a `SHUTDOWN` event it is required to kill all its tasks, send `TASK_KILLED` updates and gracefully exit. 
* `error`: Sent by the agent when an asynchronous error event is generated. It is recommended that the executor abort when it receives an error event and retry subscription.

**Events from Executor**  
The following events from the Executor calls are exposed:

* `sent_subscribe`: Is emitted when the executor has sent the `SUBSCRIBE` request.
* `sent_update`: Is emitted when the scheduler has sent the `UPDATE` request to the agent.
* `sent_message`: Is emitted when the scheduler has sent the `MESSAGE` request to send arbitrary binary data to the agent.

### Mesos

The module also exposes the Mesos protocol buffer object, which is loaded via [protobuf.js](https://github.com/dcodeIO/ProtoBuf.js/). It can be used to create the objects which can be then passed to the scheduler/executor methods.

**Example:**
```javascript
var Mesos = require("mesos-framework").Mesos.getMesos();

var TaskID = new Mesos.TaskID("my-task-id");
```

You can also instantiate Mesos protocol buffer objects from plain JSON. Be sure to follow the structure defined in the `mesos.proto` protobuf though, otherwise this will raise an error...

**Example:**
```javascript
var Builder = require("mesos-framework").Mesos.getBuilder();

var taskId = {
    "value": "my-task-id"
};

var TaskID = new (Builder.build("mesos.TaskID"))(taskId);
```