const rp = require('request-promise');
const cheerio = require('cheerio');
const chalk = require('chalk');
const neo4j = require('neo4j-driver').v1;

// Neo4j
const uri = "bolt://localhost:7687";
const user = "neo4j";
const password = "admin";
const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

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
  let session;

  // Remove existing nodes and relations.
  session = driver.session();
  response = await session.run('MATCH (n) DETACH DELETE n');
  session.close();

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
  for (var i = 0; i < pixelmons.length; i++) {
    if (pixelmons[i].name == "-") {
      continue;
    }
    response = await rp(pixelmons[i].link);
    $ = cheerio.load(response);
    var pokemon = {};
    // Get the information about the pokemons and store it.
    // Right table
    var stats = $($("table")[1]).find("td");
    for (var j = 2; j < stats.length; j+=3) {
      let data = $($(stats)[j]).text().trim();
      data = data.replace(/[\n#]+/g, "~");
      switch (j) {
        case 2:
          pokemon.name = data;
          break;
        case 5:
          pokemon.id = parseInt(data.replace("~", ""));
          break;
        case 8:
          pokemon.type = data.split("~");
          break;
        case 11:
          pokemon.catchrate = parseInt(data.split("~")[1]);
          break;
        case 14:
          pokemon.ability = data.split("~").slice(1)[0].split("/");
          break;
        case 17:
          pokemon.hiddenability = data.split("~").slice(1)[0].split("/");
          break;
        case 20:
          pokemon.spawntime = (data.split("~").slice(1)[0] ? data.split("~").slice(1)[0].split("/") : "None");
          break;
        case 23:
          let lvl = (data.split("~").slice(1)[0] ? data.split("~").slice(1)[0].split("-") : {low: '0', high: '0'});
          pokemon.levelrange = {
            low: parseFloat(lvl[0]),
            high: parseFloat(lvl[1])
          };
          break;
        case 26:
          pokemon.spawnlocation = (data.split("~").slice(1)[0] ? data.split("~").slice(1)[0].split("/") : "None");
          break;
        case 29:
          let genStr = data.split("~").slice(1)[0].split(", ");
          if (genStr[0] == 'Genderless') {
            pokemon.gender = {
              male: 0,
              female: 0
            };
          } else {
            pokemon.gender = {
              male: parseFloat(genStr[0]),
              female: parseFloat(genStr[1]),
            };
          }

          break;
        case 32:
          pokemon.evyield = data.split("~").slice(1).map((item) => {
            let vals = item.split(" ");
            return {
              type: vals[1],
              amount: parseInt(vals[0])
            };
          });
          break;
        case 35:
          pokemon.mount = data.split("~").slice(1, 2);
          break;
        case 38:
          pokemon.egggroup = data.split("~").slice(1)[0].split("/").map((item) => {return item.replace(" (Egg Group)", "");});
          break;
        case 41:
          let vals = data.split("~").slice(1)[0].split("%");
          let behs = [];
          for (let a = 0; a < vals.length - 1; a++) {
            let tmp = vals[a].split(" ");
            let beh = {
              type: tmp[0],
              chance: parseInt(tmp[1])
            };
            behs.push(beh);
          }
          pokemon.behavior = behs;
          break;
        default:
          break;
      }
    }

    // Add the poke to the db.
    session = driver.session();
    response = await session.run(
      'CREATE (a:Pixelmon {name: $name, id: $id, data: $data}) RETURN a',
      {name: pokemon.name, id: pokemon.id, data: JSON.stringify(pokemon)}
    );
    session.close();
    // For each of abiliies
    for (var b = 0; b < pokemon.ability.length; b++) {
      session = driver.session();
      response = await session.run(
        'MATCH (a:Pixelmon {id: $id}) MERGE (b:Ability {name: $name}) MERGE (a) - [r:ABILITY] -> (b) RETURN a',
        {id: pokemon.id, name: pokemon.ability[b]}
      );
      session.close();
    }

    // For each of hidden ability
    for (var b = 0; b < pokemon.hiddenability.length; b++) {
      session = driver.session();
      response = await session.run(
        'MATCH (a:Pixelmon {id: $id}) MERGE (b:Ability {name: $name}) MERGE (a) - [r:HIDDEN_ABILITY] -> (b) RETURN a',
        {id: pokemon.id, name: pokemon.hiddenability[b]}
      );
      session.close();
    }
    // For each of the type
    for (var b = 0; b < pokemon.type.length; b++) {
      session = driver.session();
      response = await session.run(
        'MATCH (a:Pixelmon {id: $id}) MERGE (b:Type {name: $name}) MERGE (a) - [r:TYPE] -> (b) RETURN a',
        {id: pokemon.id, name: pokemon.type[b]}
      );
      session.close();
    }

    // Success message
    msg = "Pixelmon page crawled successfully for (" + (i + 1) +") " + pixelmons[i].name;
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
  driver.close();
}

function handleError(err, msg, socket) {
  status = statuses[2];
  lastRunTime = Date.now();
  lastMessage = msg;
  messages.push(msg);
  error("Crawling Error", msg);
  error("Reason", err.message);
  error("Stack", err.stack);
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
