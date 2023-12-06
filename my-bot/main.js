import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { processSearch, checkURLs } from './alerter-logic.js';
import checksum from 'checksum';
import config from './config.js';
import sqlite3 from 'sqlite3';
import { InlineKeyboard } from 'grammy';  // Import InlineKeyboard
import { checkIfValidURL, checkIfValidEmail } from './middleware/validators.js';
import c from 'config';
// Create an instance of the `Bot` class and pass your bot token to it.
const bot = new Bot(process.env.BOT_TOKEN_DEV); // <-- put your bot token between the ""
// Create a conversation
bot.use(session({ initial: () => ({ userEmail : "", expDate: "", userLinks: []}) }));
bot.use(conversations(collectUserEmail));
bot.use(createConversation(collectUserEmail));

let db = new sqlite3.Database('./db/KijijiAlerter_db.db');
// Create an object to store user intervals in an array with chatid as key, 
//used to support running intervals for multiple users
let userIntervals = [];
// const currentTime = new Date().toISOString();  // Get current time in ISO format
// db.all(`SELECT chatID FROM Users WHERE patrolActive = TRUE
//         AND datetime(expDate) >= datetime(?)`, [currentTime], (err, rows) => {
//   if (err) {
//     console.log(err);
//   } else {
//     rows.forEach((row) => {
//       userIntervals[row.chatID] = setInterval( () => {
//       // code for launching patrols for all users here:
//         if (ctx.session.userLinks) {
//         checkURLs(ctx.session.userLinks);
//       }
//       }, process.env.CHECK_INTERVAL_MS || 600000);
//     });
//   }
// }); 

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
  let db = new sqlite3.Database('./db/KijijiAlerter_db.db');
  // query database for all links for specific chatid and put them into userLinks array with hash and chatid for each link to be used in checkURLs function
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
      let message = "Your search links:\n";
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
  
  // SEPARATE INTO A SEPARATE FUNCTION TO BE CALLED AFTER SERVER STARTS, 
  // BUT ADD QUERY TO GET ALL USERS WITH NON-EXPIRED SUBSCRIPTIONS AND THEIR RELATED LINKS. 
  // USE OVERLOADING TO PASS ALL THAT DATA TO THE FUNCTION
    //query the database for all links for specific chatid and put them into userLinks array
  const db = new sqlite3.Database('./db/KijijiAlerter_db.db');



  // query database for all links for specific chatid and put them into userLinks array with hash and chatid for each link to be used in checkURLs function
    db.all(`SELECT url FROM Links WHERE chatID = ${ctx.message.chat.id}`, async (err, rows) => {
      if (err) {
        console.log(err);
      } else {
        rows.forEach((row) => {
          ctx.session.userLinks.push({
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
  console.log("sitesToCrawl: " + JSON.stringify(ctx.session.userLinks));

  if (ctx.session.userLinks.length === 0) {
    ctx.reply(`Please add URLs with command \n"/addlink <your_url_here_no_brackets>"`);
    return;
  }
  if (userIntervals[ctx.chat.id]) {
    ctx.reply("🕵 Already running Ad-Patrol... Use 🛑 /stop command to stop current patrol and then /start to relaunch");
    return;
  }
  //check if current date is past expiration date
  const expirationDate = new Date(ctx.session.expDate);
  const currentDate = new Date();
  if (expirationDate < currentDate) {
    ctx.reply(" 😞 Your subscription has expired. Please purchase a new subscription to continue using the bot.");
    return;
  }


  // Generate INITIAL hashes for each URL
  Promise.all(ctx.session.userLinks.map(async (link) => {
    const topResultsString = await processSearch(link);
    //console.log("topResultsObj: " + JSON.stringify(topResultsObj));
    link.hash = checksum(topResultsString);    
    return link;
  }));

  // 600000ms = 10 minutes add interval with ctx.chat.id as key to userIntervals object to support multiple users
  userIntervals[ctx.chat.id] = setInterval( () => {
    // print userIntervals array to console
    console.log("userIntervals: " + JSON.stringify(userIntervals[ctx.chat.id]));
  if (ctx.session.userLinks) {
    checkURLs(ctx.session.userLinks);
  } else {
    ctx.reply(`Please add URLs with command 
              \n/addlink <your_url_here_no_brackets>`);
  }
  }, process.env.CHECK_INTERVAL_MS || 600000);
  ctx.reply("🕵 Started Ad-Patrol...");
  console.log('🕵 Started Ad-Patrol...');

  // set patrolActive to true in database
  await setPatrolState(ctx.chat.id, true);
});

db.close();
} catch (error) {
  console.log(`❌ Error starting patrol: ${error.message}`);
}
});

// Command to stop the patrol
bot.command("stop", async (ctx) => {
  if (userIntervals[ctx.chat.id]) {
    clearInterval(userIntervals[ctx.chat.id]);
    delete userIntervals[ctx.chat.id];
    // set patrolActive to false in database
    await setPatrolState(ctx.chat.id, false);
    // remove all links from userLinks array to prevent duplicate links in the array
    ctx.session.userLinks = [];
    console.log("🛑 Stopped Ad-Patrol...");
    ctx.reply("🛑 Patrol has been stopped.");
  } else {
    ctx.reply("💁 Patrol is not currently running.");
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
                    // Close the database connection
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
    // Close the database connection in case of an error
    db.close();
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
          db.close();
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
          if (userIntervals[row.chatID]) {
            clearInterval(userIntervals[row.chatID]);
            delete userIntervals[row.chatID];
            // set patrolActive to false in database
            setPatrolState(row.chatID, false);
            //!!! remove all links from relevant userLinks arrays to prevent duplicate links in the array
            //ctx.session.userLinks = []; this doesn't work because ctx is not defined here
            // solution: 

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

// Check for expired subscriptions every 24 hours
setInterval(checkForExpiredSubscriptions, 86400000);

// keep track of sessions in a database
//
// const session = new Map();
// bot.use((ctx, next) => {
//   if (!session.has(ctx.chat.id)) {
//     session.set(ctx.chat.id, { userLinks: [] }); 
//   }
//   return next();
// });

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


