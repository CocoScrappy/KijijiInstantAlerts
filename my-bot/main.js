import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { processSearch, checkURLs } from './alerter-logic.js';
import checksum from 'checksum';
import config from './config.js';
import sqlite3 from 'sqlite3';
import { InlineKeyboard } from 'grammy';  // Import InlineKeyboard
import { checkIfValidURL, checkIfValidEmail } from './middleware/validators.js';
// Create an instance of the `Bot` class and pass your bot token to it.
const bot = new Bot(process.env.BOT_TOKEN_DEV); // <-- put your bot token between the ""
// Create a conversation
bot.use(session({ initial: () => ({ userEmail : ""}) }));
bot.use(conversations(collectUserEmail));
bot.use(createConversation(collectUserEmail));


// Create an object to store user intervals in an array with chatid as key, used to support running intervals for multiple users
let userIntervals = [];


//when bot is initially added by a new user, prompt for email address
bot.command("start", async (ctx) => {
  //check if chat is private
  if (ctx.chat.type === "private") {
    await ctx.reply("Welcome to KijijiAlerter! \nPlease provide an email address in case we need to contact you or troubleshoot an issue:");
    await ctx.conversation.enter("collectUserEmail");
    await ctx.reply("You are all set! Use /help to see available commands.");
  }
  else {
    ctx.reply("Channels and groups are not currently supported. Add me to a private chat to get started.");
  }
});




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
  /patrol - Start alerter
  /stop - Stop alerter
  `);
});

// Command to show all search URLs. SQLLite supports multiple read transactions but only one write transaction at a time.
bot.command("showlinks", (ctx) => {

  const myLinks = [];

  let db = new sqlite3.Database('./db/KijijiAlerter_db.db');
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
  if (!url || checkIfValidURL(url) === false) {
    ctx.reply("Please provide a valid URL in format: /addlink <your_url_here_no_brackets>");
    return;
  }
  //check if url is already in the database
  let db = new sqlite3.Database('./db/KijijiAlerter_db.db');
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

//pass interval id to start command to be able to stop the interval
bot.command("patrol", (ctx) => {
  try {
    if (userIntervals[ctx.chat.id]) {
      ctx.reply("🕵 Already running Ad-Patrol... Use /stop command to stop current patrol and then /start to relaunch");
      throw new Error("🕵 Already running Ad-Patrol... Use /stop command to stop current patrol and then /start to relaunch");
    }
  //query the database for all links for specific chatid and put them into searches array
  const db = new sqlite3.Database('./db/KijijiAlerter_db.db');
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
bot.on("message", (ctx) => ctx.reply("Got another message but it's not a command. Use /help for menu."));



// Handle callback queries for button presses in showlinks command
bot.callbackQuery(/delete_(\d+)/, (ctx) => {

  const index = parseInt(ctx.match[1]);
  console.log("Index: " + index);
  const myLinks = [];
  let db = new sqlite3.Database('./db/KijijiAlerter_db.db');
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
          let db = new sqlite3.Database('./db/KijijiAlerter_db.db');
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

async function getValidEmail(conversation, ctx) {
  while (true) {
      const { message } = await conversation.wait();
      ctx.session.userEmail = message.text;

      if (checkIfValidEmail(ctx.session.userEmail)) {
          return ctx.session.userEmail;
      } else {
          ctx.reply(ctx.session.userEmail + " is not a valid email address.");
          await ctx.reply("Please enter a valid email address:");
      }
  }
}

async function confirmEmail(conversation, ctx, email) {
  while (true) {
      await ctx.reply(`Please confirm that you entered the correct email address ${email} (y/n):`);
      const { message } = await conversation.wait();
      ctx.session.confirmation = message.text.toLowerCase();

      if (['y', 'yes'].includes(ctx.session.confirmation)) {
          return true;
      } else {
          await ctx.reply("Please re-enter your email address:");
          email = await getValidEmail(conversation, ctx);
      }
  }
}

async function checkIfInDb(email, chatID) {
  return new Promise((resolve, reject) => {
      try {
          let db = new sqlite3.Database('./db/KijijiAlerter_db.db');
          db.all(
              'SELECT 1 FROM Users WHERE email = ? OR chatID = ?;',
              [email, chatID],
              (err, rows) => {
                  if (err) {
                      reject(err);
                  } else {
                      resolve(rows.length === 0);
                  }
                  db.close();
              }
          );
      } catch (error) {
          console.error('Error:', error);
          db.close();
      }
  });
}

// Main flow
async function collectUserEmail(conversation, ctx) {
  while (true) {
      const userEmail = await getValidEmail(conversation, ctx);
      if (await confirmEmail(conversation, ctx, userEmail)) {
          if (await checkIfInDb(userEmail, ctx.chat.id)) {
              console.log("Email address is valid and unique. Proceeding...");

              let db = new sqlite3.Database('./db/KijijiAlerter_db.db');

              try {
                // Insert into Users table
                let lowerCaseEmail = userEmail.toLowerCase();
                db.run(`
                    INSERT INTO Users (chatID, email, expDate, canContact) 
                    VALUES (?, ?, datetime('now', '+2 days'), 1)`, [ctx.chat.id, lowerCaseEmail], (err) => {
                    if (err) {
                        console.error('Error inserting data:', err);
                    } else {
                        console.log('Data inserted successfully.');
                    }
            
                    // Close the database connection
                    db.close();
                });
            } catch (error) {
                console.error('Error inserting user into user table:', error);
                // Close the database connection in case of an error
                db.close();
            }

              break;
          } else {
              ctx.reply("There is an email address associated with your account, "+
              "if you would like to change your contact email please use /help for menu.");
              break;
          }
      }
  }
}



// Code for integrating Telegram push notifications here

// Function to send Telegram message
export async function sendMessage(chatId, message) {
    try {
      await bot.api.sendMessage(chatId, message);
    } catch (error) {
      console.log("Error sending message:", error);
    }
  }

// Start the bot -connect to the Telegram servers and wait for messages.
bot.start();


