// Copyright the project authors as listed in the AUTHORS file.
// All rights reserved. Use of this source code is governed by the
// license that can be found in the LICENSE file.

const socketio = require('socket.io');
const mqtt = require('mqtt');
var smDevice = require('node-switchmate3').Switchmate3Device;

const PAGE_WIDTH = 400;
const PAGE_HEIGHT = 200;

let eventSocket = null;

const Server = function() {
}


Server.getDefaults = function() {
  return { 'title': 'mqtt - switchmate bridge' };
}

let  replacements;
Server.getTemplateReplacments = function() {
  if (replacements === undefined) {
    const config = Server.config;

    replacements = [{ 'key': '<DASHBOARD_TITLE>', 'value': Server.config.title },
                    { 'key': '<UNIQUE_WINDOW_ID>', 'value': Server.config.title },
                    { 'key': '<PAGE_WIDTH>', 'value': PAGE_WIDTH },
                    { 'key': '<PAGE_HEIGHT>', 'value': PAGE_HEIGHT }];

  }
  return replacements;
}


const recentActivity = new Array()
function pushActivity(entry) {
  const newEntry = new Date() + ':' + entry;
  recentActivity.push(newEntry);
  console.log(newEntry);
  eventSocket.emit('recent_activity', newEntry);
  if (recentActivity.length > Server.config.MaxRecentActivity) {
    recentActivity.splice(0,1);
  }
}


Server.startServer = function(server) {
  const deviceMap = new Array();

  // setup mqtt
  let  mqttOptions;
  if (Server.config.mqttServerUrl.indexOf('mqtts') > -1) {
    mqttOptions = { key: fs.readFileSync(path.join(__dirname, 'mqttclient', '/client.key')),
                    cert: fs.readFileSync(path.join(__dirname, 'mqttclient', '/client.cert')),
                    ca: fs.readFileSync(path.join(__dirname, 'mqttclient', '/ca.cert')),
                    checkServerIdentity: function() { return undefined }
    }
  }

  eventSocket = socketio.listen(server);

  const mqttClient = mqtt.connect(Server.config.mqttServerUrl, mqttOptions);
  mqttClient.on('connect', () => {
    Server.config.devices.forEach((currentValue, index, array) => {
      mqttClient.subscribe(currentValue.topic);
      deviceMap[currentValue.topic] = currentValue.device;
    });
  });

  mqttClient.on('message', (topic, message) => {
    if (deviceMap[topic]) {
      const device = deviceMap[topic];
      smDevice.discoverById(device.id, (smDeviceHandle) => {
        try {  
          const togMode = smDeviceHandle.ToggleMode();
          togMode.event.on('fail', (error) => {
            pushActivity('switchmate request failed:' +  error);
          });

          if (message == 'on') {
            pushActivity(topic + '|' + message);
            togMode.TurnOn();
          } else if (message == 'off') {
            pushActivity(topic + '|' + message);
            togMode.TurnOff();
          } else {
            pushActivity(topic + '|' + message + '|UNRECOGNIZED REQUEST' );
          }
        } catch (error) {
          pushActivity('switchmate request failed:' +  error);
        };
      });
    } else {
      // should not occur as we only listen on known topics
      pushActivity(topic + '|UNKNOWN TOPIC' );
    }
  });
}


if (require.main === module) {
  const path = require('path');
  const microAppFramework = require('micro-app-framework');
  microAppFramework(path.join(__dirname), Server);
}

module.exports = Server;
