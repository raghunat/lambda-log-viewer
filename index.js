// jshint esnext:true
// jshint node:true
'use strict';
const express = require('express');
const path = require('path');
const AWS = require('aws-sdk');
const async = require('async');
const fs = require('fs');

AWS.config.update({
  region: 'us-east-1'
});
let cloudwatchlogs = new AWS.CloudWatchLogs();

let app = express();

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/logs', (req, res) => {
  let streams = [];
  let paging = true;
  let token;
  let logs = [];
  let start = new Date();
  start.setHours(start.getHours() - parseInt(req.query.hours));
  let end = new Date();

  async.whilst(
    function () {
      return paging;
    },
    function (callback) {
      cloudwatchlogs.describeLogStreams({
        logGroupName: '/aws/lambda/' + req.query.name,
        orderBy: 'LastEventTime',
        nextToken: token,
        descending: true
      }, function (err, data) {
        if (err) return callback(err);

        if (data.logStreams[0].firstEventTimestamp < start.getTime()) {
          paging = false;
        }

        streams = streams.concat(data.logStreams);

        if (data.nextToken) {
          token = data.nextToken;
        } else {
          paging = false;
        }
        setTimeout(function () {
          callback();
        }, 100);
      });
    },
    function (err, n) {
      if (err) return res.status(500).json(err); // an error occurred
      console.log('Number of streams found', streams.length);
      console.log(start, start.getTime(), end, end.getTime());
      let count = 0;
      async.eachLimit(streams, 2, function (stream, next) {
        count++;
        console.log(`Started ${count} out of ${streams.length}`);
        cloudwatchlogs.getLogEvents({
          logGroupName: '/aws/lambda/' + req.query.name,
          logStreamName: stream.logStreamName,
          endTime: end.getTime(),
          startTime: start.getTime()
        }, function (err, data) {
          if (err) return next(err); // an error occurred
          logs = logs.concat(data.events);
          next();
        });
      }, function (err) {
        if (err) {
          return res.status(500).json(err); // an error occurred
        } else {
          fs.writeFileSync('logs.json', JSON.stringify(logs, null, 1));
          return res.status(200).json(logs);
        }
      });
    }
  );
});



app.use('/bower_components', express.static('bower_components'));
app.listen(process.env.LAMBDA_LOGS_PORT || 3333, () => {
  console.log(`Listening at localhost:${process.env.LAMBDA_LOGS_PORT || 3333}`);
});
