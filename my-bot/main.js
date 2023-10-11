import { Bot } from 'grammy';
import { generateTopResultsString, checkURLs } from './alerter-logic.js';
import checksum from 'checksum';
import config from './config.js';
import sqlite3 from 'sqlite3';

// Create an instance of the `Bot` class and pass your bot token to it.
const bot = new Bot(process.env.BOT_TOKEN); // <-- put your bot token between the ""
let intervalId;
// You can now register listeners on your bot object `bot`.
// grammY will call the listeners when users send messages to your bot.

// Handle errors
bot.catch((err) => {
  console.log(`Error: ${err}`); // there was an error!
});

// help command to display available commands
bot.command("help", (ctx) => {
  console.log("ChatID: " + ctx.message.chat.id);
  ctx.reply(`
  Available commands:
  /help - Display this message
  /showlinks - Show all search URLs
  /deletelink <#> - Delete a search URL by its index
  /addlink <url> - Add a new search URL
  /start - Start alerter
  /stop - Stop alerter
  `);
});

// Command to show all search URLs. SQLLite supports multiple read transactions at the same time.
bot.command("showlinks", (ctx) => {
  //query the database for all links for specific chatid and put them into searches array
  // db creation code:
  //   CREATE TABLE IF NOT EXISTS Links (
  //     urlID INTEGER PRIMARY KEY AUTOINCREMENT,
  //     url TEXT,
  //     chatID INTEGER,
  //     FOREIGN KEY (chatID) REFERENCES Chats(chatID)
  // )
  const myLinks = [];

  let db = new sqlite3.Database('./db/VovaKijijiAlerter_db.db');
  // query database for all links for specific chatid and put them into searches array with hash and chatid for each link to be used in checkURLs function
    db.all(`SELECT url FROM Links WHERE chatID = ${ctx.message.chat.id}`, (err, rows) => {
      if (err) {
        console.log(err);
      } else {
        rows.forEach((row) => {
          myLinks.push({
            url: row.url,
            hash: "",
            newAdUrl: "",
            chatId: ctx.message.chat.id,
          });
        });
      }
  if (myLinks.length > 0) {
    let message = "My search links:\n";
    myLinks.forEach((link, index) => {
      message += `${index + 1}. ${link.url}\n`;
    });
    ctx.reply(message);
    console.log("Links: " + JSON.stringify(myLinks));
  } else {
    ctx.reply("No URLs added for search. Use /addlink to add a new search URL.");
  }
});
  db.close();
});

// Command to delete a search URL
bot.command("deletelink", (ctx) => {
  const index = parseInt(ctx.message.text.split(" ")[1]);
  const myLinks = [];
  let db = new sqlite3.Database('./db/VovaKijijiAlerter_db.db');
  // query database for all links for specific chatid and put them into searches array with hash and chatid for each link to be used in checkURLs function
    db.all(`SELECT url FROM Links WHERE chatID = ${ctx.message.chat.id}`, (err, rows) => {
      if (err) {
        console.log(err);
      } else {
        rows.forEach((row) => {
          myLinks.push({
            url: row.url,
            hash: "",
            newAdUrl: "",
            chatId: ctx.message.chat.id,
          });
        });
      }

  //check if index is valid
  if (index && (index <= myLinks.length)) {
    //delete from database
    let db = new sqlite3.Database('./db/VovaKijijiAlerter_db.db');
    // query database to delete link by index which is an order number in the list of links for a specific chatid, not urlid. And delete from searches array
    db.run(`DELETE FROM Links WHERE urlID = (SELECT urlID FROM Links WHERE chatID = ${ctx.message.chat.id} LIMIT 1 OFFSET ${index - 1})`);
    //searches.splice(index - 1, 1);
    ctx.reply("Search URL deleted!");
  } else {
    ctx.reply("Please provide a valid index.");
  }
});
  db.close();
});

// Command to add a new search URL
bot.command("addlink", async (ctx) => {
  //add link to the database
  const url = ctx.message.text.split(" ")[1];
  //check if url is valid
  if (!url) {
    ctx.reply("Please provide a valid URL.");
    return;
  }
  //check if url is already in the database
  let db = new sqlite3.Database('./db/VovaKijijiAlerter_db.db');
  db.all(`SELECT url FROM Links WHERE chatID = ${ctx.message.chat.id}`, (err, rows) => {
    if (err) {
      console.log(err);
    } else {
      rows.forEach((row) => {
        if (row.url === url) {
          ctx.reply("This URL is already in the database.");
          return;
        }
      });
    }
  });
  // insert url into database
  db.run(`INSERT INTO Links (url, chatID) VALUES ('${url}', ${ctx.message.chat.id})`);
  // add url to searches array
//   searches.push({
//     url,
//     hash: "",
//     chatId: ctx.message.chat.id,
// });
  ctx.reply("Search URL added!");
});

// Handle the /start command.
bot.command("start", (ctx) => {
  ctx.reply("🕵 Started Ad-Patrol...")
  console.log('🕵 Started Ad-Patrol...')
  //query the database for all links for specific chatid and put them into searches array
  const db = new sqlite3.Database('./db/VovaKijijiAlerter_db.db');
  const searches = [];
  // query database for all links for specific chatid and put them into searches array with hash and chatid for each link to be used in checkURLs function
    db.all(`SELECT url FROM Links WHERE chatID = ${ctx.message.chat.id}`, (err, rows) => {
      if (err) {
        console.log(err);
      } else {
        rows.forEach((row) => {
          searches.push({
            url: row.url,
            hash: "",
            newAdUrl: "",
            chatId: ctx.message.chat.id,
            price: "",
            attr1: "",
            attr2: "",
          });
        });
      }
  //
  console.log("sitesToCrawl: " + JSON.stringify(searches));

  // Generate INITIAL hashes for each URL
  Promise.all(searches.map(async (search) => {
    const topResultsString = await generateTopResultsString(search);
    //console.log("topResultsObj: " + JSON.stringify(topResultsObj));
    search.hash = checksum(topResultsString);    
    return search;
  }));

  // 600000ms = 10 minutes
  intervalId = setInterval( () => {
  if (searches) {
    checkURLs(searches);
  } else {
    ctx.reply(`Please add URLs with command "/addlink <url>"!`);
  }
  }, process.env.CHECK_INTERVAL_MS || 600000);
});
});

// Command to stop the search
bot.command("stop", (ctx) => {
    clearInterval(intervalId);
    console.log("🛑 Stoped Ad-Patrol...");
    ctx.reply("🛑 Search has been stopped.");
  });

// Handle other messages.
bot.on("message", (ctx) => {
  ctx.reply("Got another message!")
  console.log("ChatId: " + ctx.message.chat.id);
});

// Now that you specified how to handle messages, you can start your bot.
// This will connect to the Telegram servers and wait for messages.

// Start the bot.
bot.start();

// Code for integrating Telegram push notifications here


// Function to send Telegram message
export async function sendMessage(chatId, message) {
    try {
      await bot.api.sendMessage(chatId, message);
    } catch (error) {
      console.log("Error sending message:", error);
    }
  }