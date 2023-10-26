import { Bot } from 'grammy';
import { processSearch, checkURLs } from './alerter-logic.js';
import checksum from 'checksum';
import config from './config.js';
import sqlite3 from 'sqlite3';
import { InlineKeyboard } from 'grammy';  // Import InlineKeyboard
import c from 'config';

// Create an instance of the `Bot` class and pass your bot token to it.
const bot = new Bot(process.env.BOT_TOKEN); // <-- put your bot token between the ""
// Create an object to store user intervals in an array with chatid as key
let userIntervals = [];

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
        // Create InlineKeyboard with buttons for each link
      const keyboard = new InlineKeyboard();
      myLinks.forEach((link, index) => {
        keyboard.row(
          { text: `Delete ${index + 1}`, callback_data: `delete_${index + 1}` }
        );
      });
      
      ctx.reply(message, {
        reply_markup: keyboard,
      });
    console.log("Links: " + JSON.stringify(myLinks));
  } else {
    ctx.reply("No URLs added for search. Use /addlink to add a new search URL.");
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
  db.close();
  ctx.reply("Search URL added!");
});

// Handle the /start command.
//pass interval id to start command to be able to stop the interval
bot.command("start", (ctx) => {
  try {
    if (userIntervals[ctx.chat.id]) {
      ctx.reply("🕵 Already running Ad-Patrol... Use /stop command to stop current patrol and then /start to relaunch");
      throw new Error("🕵 Already running Ad-Patrol... Use /stop command to stop current patrol and then /start to relaunch");
    }
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
    const topResultsString = await processSearch(search);
    //console.log("topResultsObj: " + JSON.stringify(topResultsObj));
    search.hash = checksum(topResultsString);    
    return search;
  }));

  // 600000ms = 10 minutes add interval with ctx.chat.id as key to userIntervals object to support multiple users
  userIntervals[ctx.chat.id] = setInterval( () => {
    // print userIntervals array to console
    console.log("userIntervals: " + JSON.stringify(userIntervals[ctx.chat.id]));
  if (searches) {
    checkURLs(searches);
  } else {
    ctx.reply(`Please add URLs with command "/addlink <url>"!`);
  }
  }, process.env.CHECK_INTERVAL_MS || 600000);
  ctx.reply("🕵 Started Ad-Patrol...")
  console.log('🕵 Started Ad-Patrol...')
});
} catch (error) {
  console.log(`❌ Error starting patrol: ${error.message}`);
}
});

// Command to stop the search
bot.command("stop", (ctx) => {
    clearInterval(userIntervals[ctx.chat.id]);
    delete userIntervals[ctx.chat.id];
    console.log("🛑 Stoped Ad-Patrol...");
    ctx.reply("🛑 Search has been stopped.");
  });

// Handle other messages.
bot.on("message", (ctx) => {
  ctx.reply("Got another message!")
  console.log("ChatId: " + ctx.message.chat.id);
});



// Handle callback queries for button presses
bot.callbackQuery(/delete_(\d+)/, (ctx) => {

  const index = parseInt(ctx.match[1]);
  console.log("Index: " + index);
  const myLinks = [];
  let db = new sqlite3.Database('./db/VovaKijijiAlerter_db.db');
  // query database for all links for specific chatid and put them into searches array with hash and chatid for each link to be used in checkURLs function
     db.all(`SELECT url FROM Links WHERE chatID = ${ctx.chat.id}`, (err, rows) => {
      if (err) {
        console.log(err);
      } else {
        console.log("ChatId1: " + ctx.chat.id);
        rows.forEach((row) => {
          myLinks.push({
            url: row.url,
            hash: "",
            newAdUrl: "",
            chatId: ctx.chat.id
          });
        });
        console.log("myLinksLength: " + myLinks.length);
        if (index && (index <= myLinks.length)) {
          // Delete from database
          let db = new sqlite3.Database('./db/VovaKijijiAlerter_db.db');
          console.log("ChatId2: " + ctx.chat.id);
          db.run(`DELETE FROM Links WHERE urlID = (SELECT urlID FROM Links WHERE chatID = ${ctx.chat.id} LIMIT 1 OFFSET ${index - 1})`);
          ctx.reply("Search URL deleted!");
        } else {
          ctx.reply("Please provide a valid index.");
        }
      db.close();
      }
    });
});


// Start the bot -connect to the Telegram servers and wait for messages.
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