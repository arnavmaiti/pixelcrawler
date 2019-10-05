const rp = require('request-promise');
const cheerio = require('cheerio');
const chalk = require('chalk')

// Website urls
const pixelmonWiki = "https://pixelmonmod.com"
const availablePokes = "https://pixelmonmod.com/wiki/index.php?title=Available_Pok%C3%A9mon"

// Job information.
var jobid = 0;
var statuses = [
  'running',
  'suceeded',
  'failed'
];
status = statuses[1];
var lastRunTime = 0;
var lastMessage = "";
var messages = [];
var pixelmons = [];

// Performs the run steps.
function start(socket) {
  // Run the doRequests
  doRequests(socket)
  .catch(function(err) {
    handleError(err, "There was an error while crawling.", socket);
  });
}

async function doRequests(socket) {
  let response;
  let $;
  let msg;
  // Initial call to get the list of available pixelmons
  response = await rp(availablePokes);
  // Get the pixelmon list to the array.
  $ = cheerio.load(response);
  children = $('.mw-parser-output').children();
  for (i = 0; i < children.length; i++) {
    // Find tables.
    if ($(children[i]).is('table')) {
      var gen = $(children[i - 1]).find('b').text();
      var pokes = $(children[i]).find('li a');
      for (j = 0; j < pokes.length; j++) {

        var p = {
          "name": $(pokes[j]).text(),
          "link": pixelmonWiki + $(pokes[j]).attr('href'),
          "generation": gen
        };
        pixelmons.push(p);
      }
    }
  }
  msg = pixelmons.length + " pixelmons have been found.";
  messages.push(msg);
  lastMessage = msg;
  success("Crawling Success", msg);
  socket.emit('crawl reply', {
    "type": "info",
    "message": msg
  });
  // Now run through each of the pixelmon page the parse them to get the details.
  for (var i = 0; i < 100; i++) {
    response = await(pixelmons[i].link);
    $ = cheerio.load(response);
    // Get the information about the pokemons and store it.

    // Success message
    msg = "Pixelmon page crawled successfully for " + pixelmons[i].name;
    messages.push(msg);
    lastMessage = msg;
    success("Crawling Success", msg);
    socket.emit('crawl reply', {
      "type": "info",
      "message": msg
    });
  }
  // Move to completed
  msg = "Pixelmon pages have been successfully crawled.";
  success("Crawling Success", msg);
  messages.push(msg);
  lastMessage = msg;
  socket.emit('crawl reply', {
    "type": "success",
    "message": msg
  });
  status = statuses[1];
  lastRunTime = Date.now();
}

function handleError(err, msg) {
  status = statuses[2];
  lastRunTime = Date.now();
  lastMessage = msg;
  messages.push(msg);
  error("Crawling Error", msg);
  error("Reason", err.message);
  socket.emit('crawl reply', {
    "type": "error",
    "message": msg
  });
}

function success(sum, msg) {
  msg = chalk.green("[SUCCESS] " + sum + ": ") + msg;
  console.log(msg);
}
function error(sum, msg) {
  msg = chalk.red("[ERROR] " + sum + ": ") + msg;
  console.log(msg);
}
function info(sum, msg) {
  msg = chalk.yellow("[INFO] " + sum + ": ") + msg;
  console.log(msg);
}

// Initialize the crawler once.
exports.init = function() {
  // Sets the initial values and prepares the database to store the values.
  jobid = 0;
  status = statuses[1];
  lastRunTime = 0;
  lastMessage = '';
  messages = [];
  pixelmons = [];
};

// Gets the current status of the crawling job or the last job run.
exports.status = function() {

};

// Starts a crawling job if it is not already running.
exports.start = function(socket) {
  // Check if a job is already running.
  if (status == statuses[0]) {
    // Job already running.
  } else {
    // Job not running.
    jobid++;
    status = statuses[0];
    messages = [];
    pixelmons = [];
    start(socket);
  }
};

// Stops the current job if it is running.
exports.stop = function() {

};
