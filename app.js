const express = require('express');
const app = express();

// Register routes
app.use(express.static('public'));

// Create the server
const http = app.listen(80);
const io = require('socket.io')(http);

// Utilities
const crawler = require('./utility/crawler.js');
crawler.init();

// Create the socket connection
let startTime;
let endTime;
io.of('crawl')
.on('connection', function(socket){
  startTime = Date.now();
  console.log('Crawling requested at: ' + startTime);
  socket.on('disconnect', function(){
    endTime = Date.now();
    console.log('Crawling completed at: ' + endTime);
    console.log('Crawling took ' + (endTime - startTime)/1000 + ' secs');
  });
  // Request types: start, stop
  // Message types: info, error, success, failure
  socket.on('crawl', function(msg){
    if (msg == "start") {
      // Check the current status of crawl job.
      // If there are no existing jobs, start one.
      crawler.start(socket);
    }
  });
});
