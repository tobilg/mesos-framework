# mesos-framework examples

There are four examples in this folder.

## commandScheduler.js

This example will just start a command-based scheduler, which simply calls `sleep 10`. After execution of this command, the task will switch to `TASK_FINISHED` state. 

To make the finished tasks restart again, we used the `restartStates` array definition within the task object. You can specify the list of task states which should trigger a restart of a task (by default, `TASK_FINISHED` doesn't trigger a restart of the task).

# dockerSchedulerBridgeNetworking.js

A simple Docker-based scheduler, which starts a simple Node.js webserver. It uses `BRIDGE` networking to allocate and map container to host ports.

# dockerSchedulerHostNetworking.js

A simple Docker-based scheduler, which starts a simple Node.js webserver. It uses `HOST` networking to allocate and use host ports.

# dockerSchedulerApacheFlink.js

A more advanced setup, which uses different task type with priorities. This scheduler start a Apache Flink cluster in HA mode (3 jobmanagers and 2 taskmanagers). 

The only two things you should need to change to run this on your cluster are the following:

* `masterUrl`: Change this either to your leading master's ip address, or use `leader.mesos` in case you're using Mesos DNS.
* `flink_recovery_zookeeper_quorum`: This is the environment variable passed to the Docker containers to enable them to use HA via your existing ZooKeeper cluster (format is `hostIp1:2181,hostIp2:2181,hostIpn:2181`).
