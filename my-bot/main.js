import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { fetchLinks, checkURLs, generateInitialSetForPatrol } from './alerter-logic.js';
import axios from 'axios';
import cheerio from 'cheerio';
import config from './config.js';
import sqlite3 from 'sqlite3';
import { InlineKeyboard } from 'grammy';  // Import InlineKeyboard
import { checkIfValidURL, checkIfValidEmail } from './middleware/validators.js';
import c from 'config';

// Create an instance of the `Bot` class and pass your bot token to it.
let db = new sqlite3.Database('./db/KijijiAlerter_db.db');
const bot = new Bot(process.env.BOT_TOKEN_DEV); // <-- put your bot token between the ""
const patrolData = new Map();

try {
  bot.use(session({ initial: createInitialSessionData }));
  bot.use(conversations(collectUserEmail));
  bot.use(createConversation(collectUserEmail));

  const rows = await new Promise((resolve, reject) => {
    db.all(`SELECT Users.chatID, expDate, url FROM Users
    JOIN Links ON Users.chatID = Links.chatID
    WHERE Users.patrolActive = 1
    AND Users.expDate > CURRENT_DATE`, (err, rows) => {
      if (err) {
        reject(err);
      }
      resolve(rows);
    });
  });
  
    // Process the db query results and populate patrolData map
    rows.forEach(async (row) => {
      const { chatID, expDate, url } = row;
      // If chatID is not in patrolData map, add it
      if (!patrolData.has(chatID)) {
        patrolData.set(chatID, { userInterval: null, expDate: expDate, userLinks: [] });
      }
      patrolData.get(chatID).userLinks.push({
        url: url,// search filter url
        topLinks: new Set(),// set of top 5 ad ids
        price: "",
        attr1: "",
        attr2: "",
        newAdUrl: "",
        chatId: chatID,
      });
    });
  console.log("patrolData: " + JSON.stringify(patrolData));
// Iterate through all values in patrolData
patrolData.forEach( async (data, chatID) => {
  await createInitialSetsForPatrol(chatID);
  data.userInterval = setInterval( async () => {
    if (data.userLinks) {
      checkURLs(data.userLinks);
    } else {
      console.log(`Please add URLs with command \n/addlink <your_url_here_no_brackets>`);
    }
  } , process.env.CHECK_INTERVAL_MS_HIGHEST || 600000);
});


  // Start the bot -connect to the Telegram servers and wait for messages.
  bot.start();
  // Check for expired subscriptions every 24 hours
  setInterval(checkForExpiredSubscriptions, 86400000);




//when bot is initially added by a new user, prompt for email address
bot.command("start", async (ctx) => {
  //check if chat is private
  if (ctx.chat.type === "private") {
    //let emailCollected = false;
    ctx.session.userLinks = [];
    ctx.session.expDate = "";
    await ctx.reply("Welcome to KijijiAlerter! \nPlease provide an email address in case we need to contact you or troubleshoot an issue:");
    await ctx.conversation.enter("collectUserEmail");

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
  /help - Display this message ℹ️
  /showlinks - Show all search URLs 📃
  /deletelink <#> - Delete a search URL by its index ❌
  /addlink <url> - Add a new search URL ➕
  /patrol - Start alerter 🕵️‍♂️
  /stop - Stop alerter 🛑

  General flow: \nadd links with /addlink <url> command one by one, then \nstart alerter with /patrol command. 
  If you want to add more links, stop the alerter with /stop command, then \nadd links with /addlink <url> command 
  and then \nstart alerter again with /patrol command.
  `);
});

// Command to show all search URLs. SQLLite supports multiple read transactions but only one write transaction at a time.
bot.command("showlinks", (ctx) => {
  const myLinks = [];

  // IDEALLY, MOVE THIS TO A SEPARATE FUNCTION TO BE CALLED AFTER SERVER STARTS FOR ALL USERS AND USE SESSIONS TO STORE THE DATA
  let db = new sqlite3.Database('./db/KijijiAlerter_db.db');
  // query database for all links for specific chatid and put them into userLinks array with hash and chatid for each link to be used in checkURLs function
  db.all(`SELECT url FROM Links WHERE chatID = ${ctx.message.chat.id}`, (err, rows) => {
    if (err) {
      console.log(err);
    } else {
      rows.forEach((row) => {
        myLinks.push(row.url);
      });
    }
    if (myLinks.length > 0) {
      let message = "Your search links:\n";
      myLinks.forEach((link, index) => {
        message += `${index + 1}. ${link}\n`;
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
      ctx.reply(`➕ No URLs provided for the search. Please add a valid URL in format:
                 \n/addlink <your_url_here_no_brackets>`);
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
    ctx.reply(`➕ Please add a valid URL in format: 
                \n/addlink <your_url_here_no_brackets>`);
    return;
  }
  //check if url is already in the database
  let db = new sqlite3.Database('./db/KijijiAlerter_db.db');
  db.all(`SELECT url FROM Links WHERE chatID = ${ctx.message.chat.id}`, (err, rows) => {
    if (err) {
      console.log(err);
    } else {
      let urlAlreadyInDb = false;
      rows.forEach((row) => {
        if (row.url === url) {
          ctx.reply("This URL is already in the database.");
          urlAlreadyInDb = true;
          return;
        }
      }
      );
      if (!urlAlreadyInDb) {
            // insert url into database
            db.run(`INSERT INTO Links (url, chatID) VALUES ('${url}', ${ctx.message.chat.id})`);
            ctx.reply("Search URL added!");
        }
    }
  });
  db.close();
  console.log("Db closed!");
});


//pass interval id to start command to be able to stop the interval
bot.command("patrol", async(ctx) => {
  try {
    //check if patrolData for given chatID have been initialized
    if (!patrolData.has(ctx.message.chat.id)) {
      patrolData.set(ctx.message.chat.id, { userInterval: null, expDate: "", userLinks: [] });
    } else {
      if (patrolData.get(ctx.message.chat.id).userInterval !== null) {
        ctx.reply("🕵 Already running Ad-Patrol... Use 🛑 /stop command to stop current patrol and then /start to relaunch");
        return;
      }
    }
    //query the database for all links for specific chatid and put them into userLinks array
    const db = new sqlite3.Database('./db/KijijiAlerter_db.db');
    // query database for all links for specific chatid and put them into userLinks array with hash and chatid for each link to be used in checkURLs function
    db.all(`SELECT Users.chatID, Users.expDate, Links.url FROM Users
            JOIN Links ON Users.chatID = Links.chatID
            WHERE Users.chatID = ?
            AND Users.expDate > CURRENT_DATE`,[ctx.message.chat.id], async (err, rows) => {
      if (err) {
        console.log(err);
      } else {
        rows.forEach((row) => {
          patrolData.get(ctx.message.chat.id).userLinks.push({
            url: row.url,
            topLinks: new Set(),// set of top 5 ad ids
            price: "",
            attr1: "",
            attr2: "",
            newAdUrl: "",
            chatId: ctx.message.chat.id,
          });
        });
      }

      if (patrolData.get(ctx.message.chat.id).userLinks === undefined || patrolData.get(ctx.message.chat.id).userLinks.size === 0) {
        ctx.reply(`Oops! Either your subscription expired or you do not have any links to patrol.
        Please use /help to sort out either of those issues.`);
        // because SQL query above looks for non expired subscriptions
        return;
      }

      await createInitialSetsForPatrol(ctx.message.chat.id);
      try {
        // 600000ms = 10 minutes add interval with ctx.chat.id as key to userIntervals object to support multiple users
        patrolData.get(ctx.message.chat.id).userInterval = setInterval( () => {
          if (patrolData.get(ctx.message.chat.id).userLinks) {
            checkURLs(patrolData.get(ctx.message.chat.id).userLinks);
          } else {
            ctx.reply(`Please add URLs with command 
                      \n/addlink <your_url_here_no_brackets>`);
          }
          }, process.env.CHECK_INTERVAL_MS_HIGHEST || 600000);
          ctx.reply("🕵 Started Ad-Patrol...");
          console.log('🕵 Started Ad-Patrol...');
      } catch (error) {
        console.log(`❌ Error creating interval by user: ${error.message}`);
        console.log(error.stack);
      }
      await setPatrolState(ctx.chat.id, true);

    });
  } catch (error) {
    console.log(`❌ Error starting patrol: ${error.message}`);
    //log error trace
    console.log(error.stack);
  } finally {
    // close the database connection in the finally block
    db.close();
  }
});

// Command to stop the patrol
bot.command("stop", async (ctx) => {
  try {
    if (patrolData.has(ctx.chat.id)) {
      clearInterval(patrolData.get(ctx.chat.id).userInterval);
      //set userInterval to null
      patrolData.get(ctx.chat.id).userInterval = null;
      // set patrolActive to false in database
      await setPatrolState(ctx.chat.id, false);
      // remove all links from userLinks array to prevent duplicate links in the array
      patrolData.get(ctx.chat.id).userLinks = [];
      console.log("🛑 Stopped Ad-Patrol...");
      ctx.reply("🛑 Patrol has been stopped.");
    } else {
      ctx.reply("💁 Patrol is not currently running.");
    }
  } catch (error) {
    console.log(`❌ Error stopping patrol: ${error.message}`);
  }
  });

// Handle other messages.
bot.on("message", (ctx) => ctx.reply("Got another message but it's not a command. Use /help for menu."));


// Handle callback queries for button presses in showlinks command
bot.callbackQuery(/delete_(\d+)/, (ctx) => {
  const index = parseInt(ctx.match[1]);
  console.log("Index: " + index);
  const myLinks = [];
  let db = new sqlite3.Database('./db/KijijiAlerter_db.db');
  // query database for all links for specific chatid and put them into userLinks array with hash and chatid for each link to be used in checkURLs function
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
          ctx.reply("URL deleted!");
          //hide keyboard
          ctx.editMessageReplyMarkup();
        } else {
          ctx.reply("Please provide a valid index.");
        }
      db.close();
      }
    });
});

// Creates a new object that will be used as initial session data.
function createInitialSessionData() {
  return { userEmail : "", confirmation: ""};
}

//FIX THIS FUNCTION - endless loop
async function getValidEmail(conversation, ctx) {
  while (true) {
      const { message } = await conversation.wait();
      ctx.session.userEmail = message.text;

      if (checkIfValidEmail(ctx.session.userEmail)) {
          return ctx.session.userEmail;
      } else {
          ctx.reply(ctx.session.userEmail + " is not a valid email address.");
          await ctx.reply("Please enter a valid email address: 📧");
      }
  }
}
//FIX THIS FUNCTION - endless loop
async function confirmEmail(conversation, ctx, email) {
  while (true) {
      await ctx.reply(`Please confirm that you entered the correct email address ${email} (y/n):`);
      const { message } = await conversation.wait();
      ctx.session.confirmation = message.text.toLowerCase();

      if (['y', 'yes'].includes(ctx.session.confirmation)) {
          return true;
      } else {
          await ctx.reply("Please re-enter your email address: 📧");
          email = await getValidEmail(conversation, ctx);
      }
  }
}

async function checkIfInDb(email, chatID) {
  return new Promise((resolve, reject) => {
      try {
          let db = new sqlite3.Database('./db/KijijiAlerter_db.db');
          db.all(
              'SELECT * FROM Users WHERE email = ? OR chatID = ?;',
              [email, chatID],
              (err, rows) => {
                  if (err) {
                      reject(err);
                  } else {
                      console.log("Rows: " + JSON.stringify(rows));
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
  try {
    //FIX THIS  - endless loop
    while (true) {
      const userEmail = await getValidEmail(conversation, ctx);
      if (await confirmEmail(conversation, ctx, userEmail)) {
        console.log("ChatId: " + ctx.chat.id+ " Email: " + userEmail);
          if (await checkIfInDb(userEmail, ctx.chat.id)) {
              console.log("Email address is valid and unique. Proceeding...");
              
                let db = new sqlite3.Database('./db/KijijiAlerter_db.db');
                // Insert into Users table
                let lowerCaseEmail = userEmail.toLowerCase();
                db.run(`
                    INSERT INTO Users (chatID, email, expDate, canContact, patrolActive) 
                    VALUES (?, ?, datetime('now', '+14 days'), TRUE, FALSE)`, [ctx.chat.id, lowerCaseEmail], async (err) => {
                    if (err) {
                        console.error('Error inserting data:', err);
                    } else {
                        console.log('Data inserted successfully.');
                        await ctx.reply("You are all set!👏 Use \n/help \nto see available commands.");
                    }
            
                    ctx.session.expDate = Date.now() + 1209600000; // 14 days in milliseconds
                    db.close();
                });
            break;
          } else {
              ctx.reply("There is an email address associated with your account, "+
              "if you would like to change your contact email please contact us at kizyakov.d@gmail.com. \nUse /help now for menu.");
              break;
          }
      }
  }
  } catch (error) {
    console.error('Error inserting user into user table:', error);
    db.close();
  }
}

async function createInitialSetsForPatrol(chatID) {
  try {
    Promise.all(patrolData.get(chatID).userLinks.map(async (userLink) => {
      const HTMLresponse = await axios.get(userLink.url);
      if (HTMLresponse.status !== 200) {
        console.log(`Error fetching ${userLink.url}: ${HTMLresponse.status}`);
        return "";
      }
      //parse HTML response
      const $ = cheerio.load(HTMLresponse.data);
      console.log(`Fetching ${userLink.url}`);
      userLink.topLinks = generateInitialSetForPatrol($, userLink);
      return userLink;
      // const topResultsString = await processSearch(link);
      // //console.log("topResultsObj: " + JSON.stringify(topResultsObj));
      // link.hash = checksum(topResultsString);    
      // return link;
    }));
  } catch (error) {
    console.log(`❌ Error creating initial hashes for patrol: ${error.message}`);
    console.log(error.stack);
  }
}

async function setPatrolState(chatID, patrolState) {
  return new Promise((resolve, reject) => {
      try {
          let db = new sqlite3.Database('./db/KijijiAlerter_db.db');
          db.run(
              'UPDATE Users SET patrolActive = ? WHERE chatID = ?;',
              [patrolState, chatID],
              (err) => {
                  if (err) {
                      reject(err);
                  } else {
                      resolve();
                  }
                  db.close();
              }
          );
      } catch (error) {
          console.error('Error:', error);
          console.log(error.stack);
      }
  });
}


// Function to check for expired subscriptions and stop the patrol if expired
async function checkForExpiredSubscriptions() {
  try {
    const currentTime = new Date().toISOString();  // Get current time in ISO format
    db.all(`SELECT chatID FROM Users WHERE patrolActive = TRUE
            AND datetime(expDate) < datetime(?)`, [currentTime], (err, rows) => {
      if (err) {
        console.log(err);
      } else {
        rows.forEach((row) => {
          if (patrolData.has(row.chatID)) {
            clearInterval(patrolData.get(row.chatID).userInterval);
            delete patrolData.get(row.chatID).userInterval;
            // set patrolActive to false in database
            setPatrolState(row.chatID, false);
            console.log("🛑 Stopped Ad-Patrol for chatID: " + row.chatID);
            // Send message to user
            sendMessage(row.chatID, "😞 Your subscription has expired. Please purchase a new subscription to continue patrolling these ads.");
          }
        });
      }
    });
  } catch (error) {
    console.log(`❌ Error checking for expired subscriptions: ${error.message}`);
  }
}

} catch (err) {
  console.log(`❌ Global Error starting patrol: ${err.message}`);
  console.log(err.stack);
} finally {
  db.close();
}

// Function to send Telegram message
export async function sendMessage(chatId, message) {
  try {
    await bot.api.sendMessage(chatId, message);
  } catch (error) {
    console.log("Error sending message:", error);
  }
}

export async function addedToSetWithLimit(mySet, element) {
  if (!mySet.has(element)) {
      if (mySet.size === 5) {
          // Delete the first element to maintain the size limit
          const firstElement = mySet.values().next().value;
          mySet.delete(firstElement);
      }
      // Add the new element to the set
      mySet.add(element);
      return true;
  } else {
      return false;
  }
}