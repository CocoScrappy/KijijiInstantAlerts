import { Bot, session, Keyboard } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { fetchLinks, checkURLs, generateInitialSetForPatrol } from './alerter-logic.js';
import axios from 'axios';
import cheerio from 'cheerio';
import config from './config.js';
import sqlite3 from 'sqlite3';
import { InlineKeyboard } from 'grammy';  // Import InlineKeyboard
import { checkIfValidURL, checkIfValidEmail } from './middleware/validators.js';
import c from 'config';
import stripe from 'stripe';

// Create an instance of the `Bot` class and pass your bot token to it.

const patrolData = new Map();
const bot = new Bot(process.env.BOT_TOKEN); // <-- put your bot token between the ""
try {
  bot.use(session({ initial: createInitialSessionData }));
  bot.use(conversations(collectUserEmail, addLink/*, subscribeUser*/));
  bot.use(createConversation(collectUserEmail));
  bot.use(createConversation(addLink));
  //bot.use(createConversation(subscribeUser));
  let db = new sqlite3.Database('./db/VovaKijijiAlerter_db.db');
  const rows = await new Promise((resolve, reject) => {
    db.all(`SELECT Users.chatID, expDate, url, tier FROM Users
    JOIN Links ON Users.chatID = Links.chatID
    WHERE Users.patrolActive = 1
    AND Users.expDate > CURRENT_DATE`, (err, rows) => {
      if (err) {
        reject(err);
      }
      resolve(rows);
    });
  });
  db.close();
    // Process the db query results and populate patrolData map
    rows.forEach(async (row) => {
      const { chatID, expDate, url, tier } = row;
      // If chatID is not in patrolData hashmap, add a new entry to hashmap
      if (!patrolData.has(chatID)) {
        patrolData.set(chatID, { userInterval: null, expDate: expDate, userLinks: [], tier: tier });
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
  console.log("data.userLinks.length: " + data.userLinks.length);
  if (data.userLinks.length > 0) {
    console.log("Tier: " + data.tier);
  if (data.tier === 0 || data.tier === 3) {
    data.userInterval = setInterval( async () => checkURLs(data.userLinks), 
    process.env.CHECK_INTERVAL_MS_HIGH || 600000);
  } else if (data.tier === 1) {
    data.userInterval = setInterval( async () => checkURLs(data.userLinks), 
    process.env.CHECK_INTERVAL_MS_MID || 600000);
  } else if (data.tier === 2) {
    data.userInterval = setInterval( async () => checkURLs(data.userLinks), 
    process.env.CHECK_INTERVAL_MS_LOW || 600000);
  }
} else {
  console.log("No links for chatID: " + chatID);
}
});


// Start the bot -connect to the Telegram servers and wait for messages.
bot.start();
// Check for expired subscriptions every 24 hours
setInterval(checkForExpiredSubscriptions, 86400000);


//when bot is initially added by a new user, prompt for email address
bot.command("start", async (ctx) => {
  try {
  //check if chat is private
  if (ctx.chat.type === "private") {
    //let emailCollected = false;
    ctx.session.userLinks = [];
    ctx.session.expDate = "";
    await ctx.reply("Welcome to Kijiji Patrol Bot 🕵️‍♂️\n"+
    "\nEverybody knows that good deals don't last long on Kijiji - delay responding by several minutes and somebody else already arranged to meet the seller.😔 BUT!\n" +
    "\nYou can use me to solve this problem.😉 Whether you are looking for a new apartment, a vehicle or anything in between - I will monitor kijiji for you and notify you instantly once an ad that meets your criteria is posted.⚡" +
    "\nIf used wisely, I can help you save hundreds of dollars. \n" +
    "\nTry me out free for a month. You can buy additional time when you need, starting at $10/mo.\n" +
    "\n➡️ To start, please provide Email address you could be reached at if needed:");
    await ctx.conversation.enter("collectUserEmail");

  }
  else {
    ctx.reply("Channels and groups are not currently supported. Add me to a private chat to get started.");
  }
} catch (error) {
  console.log(`❌ Error starting bot on /start callback: ${error.message}`);
  console.log(error.stack);
}
});

// You can now register listeners on your bot object `bot`.
// grammY will call the listeners when users send messages to your bot.

// Handle errors
bot.catch((err) => {
  console.log(`Error: ${err}`); // there was an error!
});

// help command to display available commands
bot.command("menu", async (ctx) => {
  drawMainMenu(ctx);
});

// Command to subscribe to the bot
bot.command("subscribe", async (ctx) => {
  try {
    //check if chat is private
    if (ctx.chat.type === "private") {
      checkIfUserExists(ctx.message.chat.id).then(async (exists) => {
        if (exists) {
          return;
        } else {
          ctx.reply("Oops, you are not registered. Please provide an email address in case we need to contact you or troubleshoot an issue:");
          await ctx.conversation.enter("collectUserEmail");
        }
      });
      //await ctx.conversation.enter("subscribeUser");
    } else {
      ctx.reply("Channels and groups are not currently supported. Add me to a private chat to get started.");
    }
  } catch (error) {
    console.log(`❌ Error subscribing user: ${error.message}`);
    console.log(error.stack);
  }
});




// Command to show all search URLs. SQLLite supports multiple read transactions but only one write transaction at a time.
bot.command("showlinks", (ctx) => {
  let db = new sqlite3.Database('./db/VovaVovaKijijiAlerter_db.db');
  try {
  const myLinks = [];
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
          { text: `Delete #${index + 1}`, callback_data: `delete_${index + 1}` }
        );
      });
      
    ctx.reply(message, {
      reply_markup: keyboard,
    });
    console.log("Links: " + JSON.stringify(myLinks));
    } else {
      ctx.reply(`➕ No URLs provided for the search. Please select /addlink in menu to add a URL for search.`);
    }
  });
  } catch (error) {
    console.log(`❌ Error showing links: ${error.message}`);
    console.log(error.stack);
  } finally {
    db.close();
  }
});

// Command to add a new search URL
bot.command("addlink", async (ctx) => {
  //prompt user to enter url
  await ctx.reply(`➕ Go to Kijiji on your browser, configure desired search parameters, copy the link and paste it in the next message. If you wish to cancel just type "Cancel"`);
  await ctx.conversation.enter("addLink");
});

//pass interval id to start command to be able to stop the interval
bot.command("patrol", async (ctx) => {
  const db = new sqlite3.Database('./db/VovaVovaKijijiAlerter_db.db');
  try {
    //check if patrolData for given chatID have been initialized
    if (!patrolData.has(ctx.message.chat.id)) {
      patrolData.set(ctx.message.chat.id, { userInterval: null, expDate: "", userLinks: [], tier: null });
    } else {
      if (patrolData.get(ctx.message.chat.id).userInterval !== null) {
        ctx.reply("🕵 Already running Ad-Patrol... Use 🛑 /stop command to stop current patrol and then /patrol to relaunch");
        return;
      }
    }
    //query the database for all links for specific chatid and put them into userLinks array
    // query database for all links for specific chatid and put them into userLinks array with hash and chatid for each link to be used in checkURLs function
    const rows = await new Promise((resolve, reject) => {
      db.all(`SELECT Users.chatID, Users.expDate, Links.url, Users.tier FROM Users
              JOIN Links ON Users.chatID = Links.chatID
              WHERE Users.chatID = ?
              AND Users.expDate > CURRENT_DATE`, [ctx.message.chat.id], (err, rows) => {
        if (err) {
          reject(err);
        }
        resolve(rows);
      });
    });

    if (rows.length === 0) {
      ctx.reply(`Oops! Either your subscription expired or you do not have any links to patrol.
        Please use /menu to sort out either of those issues.`);
      // because SQL query above looks for non-expired subscriptions
      return;
    }

    patrolData.get(ctx.message.chat.id).tier = rows[0].tier;

    for (const row of rows) {
      patrolData.get(ctx.message.chat.id).userLinks.push({
        url: row.url,
        topLinks: new Set(), // set of top 5 ad ids
        price: "",
        attr1: "",
        attr2: "",
        newAdUrl: "",
        chatId: ctx.message.chat.id,
      });
    }

    await createInitialSetsForPatrol(ctx.message.chat.id);

    try {
      let userInfo = patrolData.get(ctx.message.chat.id);
      // 600000ms = 10 minutes add interval with ctx.chat.id as key to userIntervals object to support multiple users
      if (userInfo.tier === 0 || userInfo.tier === 3) {
        userInfo.userInterval = setInterval( () => checkURLs(userInfo.userLinks), 
        process.env.CHECK_INTERVAL_MS_HIGH || 600000);
      } else if (userInfo.tier === 1) {
        userInfo.userInterval = setInterval( () => checkURLs(userInfo.userLinks), 
        process.env.CHECK_INTERVAL_MS_MID || 600000);
      } else if (userInfo.tier === 2) {
        userInfo.userInterval = setInterval( () => checkURLs(userInfo.userLinks), 
        process.env.CHECK_INTERVAL_MS_LOW || 600000);
      }
      ctx.reply("🕵 Started Ad-Patrol...");
    }  catch (error) {
      console.log(`❌ Error creating interval for user. Error: ${error.message}`);
      console.log(error.stack);
    }

    await setPatrolState(ctx.chat.id, true);

  } catch (error) {
    console.log(`❌ Error starting patrol: ${error.message}`);
    // log error trace
    console.log(error.stack);
  } finally {
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
bot.on("message", (ctx) => ctx.reply("Got another message but it's not a command. Use /menu for menu."));


// Handle callback queries for button presses in showlinks command
bot.callbackQuery(/delete_(\d+)/, (ctx) => {
  let db = new sqlite3.Database('./db/VovaVovaKijijiAlerter_db.db');
  try {
    const index = parseInt(ctx.match[1]);
    console.log("Index: " + index);
    const myLinks = [];
    // query database for all links for specific chatid and put them into userLinks array with hash and chatid for each link to be used in checkURLs function
      db.all(`SELECT url FROM Links WHERE chatID = ${ctx.chat.id}`, (err, rows) => {
        if (err) {
          console.log(err);
        } else {
          rows.forEach((row) => {
            myLinks.push({
              url: row.url,
              chatId: ctx.chat.id
            });
          });
          console.log("myLinksLength: " + myLinks.length);
          if (index && (index <= myLinks.length)) {
            // Delete from database
            db.run(`DELETE FROM Links WHERE urlID = (SELECT urlID FROM Links WHERE chatID = ${ctx.chat.id} LIMIT 1 OFFSET ${index - 1})`);
            ctx.reply(`Link #${index} is deleted! Please restart patrol to apply changes. (/stop then /patrol)`);
            //hide keyboard
            ctx.editMessageReplyMarkup();
          } else {
            ctx.reply("Please provide a valid index.");
          }
        //db.close();
        }
    });
  } catch (error) {
    console.log(`❌ Error deleting link: ${error.message}`);
    console.log(error.stack);
  } finally {
    db.close();
  }
});

// Creates a new object that will be used as initial session data.
function createInitialSessionData() {
  return { userEmail : "", confirmation: ""};
}

// Check if user is in the database
async function checkIfUserExists(chatID) {
  let db = new sqlite3.Database('./db/VovaVovaKijijiAlerter_db.db');
  return new Promise((resolve, reject) => {
      try {
          db.all(
              'SELECT * FROM Users WHERE chatID = ?;',
              [chatID],
              (err, rows) => {
                  if (err) {
                      reject(err);
                  } else {
                      resolve(rows.length > 0);
                  }
                  db.close();
              }
          );
      } catch (error) {
        console.error('Error checking if user exists:', error);
        console.log(error.stack);
      } finally {
        db.close();
      }
  });
}

async function getValidEmail(conversation, ctx) {
  let isValidEmail = false;
  let userEmail;

  while (!isValidEmail) {
    const { message } = await conversation.wait();
    userEmail = message.text;

    if (checkIfValidEmail(userEmail)) {
      isValidEmail = true;
    } else {
      ctx.reply(userEmail + " is not a valid email address.");
      await ctx.reply("Please enter a valid email address: 📧");
    }
  }

  return userEmail;
}

async function confirmEmail(conversation, ctx, email) {
  let isConfirmed = false;

  while (!isConfirmed) {
    await ctx.reply(`Please confirm that you entered the correct email address ${email} (y/n):`);
    const { message } = await conversation.wait();
    ctx.session.confirmation = message.text.toLowerCase();

    if (['y', 'yes'].includes(ctx.session.confirmation)) {
      isConfirmed = true;
    } else {
      await ctx.reply("Please re-enter your email address: 📧");
      email = await getValidEmail(conversation, ctx);
    }
  }

  return true;
}

async function checkIfInDb(email, chatID) {
  let db = new sqlite3.Database('./db/VovaVovaKijijiAlerter_db.db');
  return new Promise((resolve, reject) => {
      try {
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
              }
          );
      } catch (error) {
          console.error('Error:', error);
          console.log(error.stack);
          reject(error);
      } finally {
        db.close();
      }
  });
}

// conversation handler to collect user email
async function collectUserEmail(conversation, ctx) {
  let userEmail;
  let isValidEmail = false;
  let userExists = false;
  let db = new sqlite3.Database('./db/VovaVovaKijijiAlerter_db.db');
    try {
    while (!isValidEmail && !userExists) {
      userEmail = await getValidEmail(conversation, ctx);

      if (await confirmEmail(conversation, ctx, userEmail)) {
        console.log("ChatId: " + ctx.chat.id + " Email: " + userEmail);

        if (await checkIfInDb(userEmail, ctx.chat.id)) {
          console.log("Email address is valid and unique. Proceeding...");

          let lowerCaseEmail = userEmail.toLowerCase();

          db.run(`
            INSERT INTO Users (chatID, email, expDate)
            VALUES (?, ?, datetime('now', '+30 days')
            )`,
            [ctx.chat.id, lowerCaseEmail],
            async (err) => {
              if (err) {
                console.error('Error inserting data:', err);
              } else {
                console.log('Data inserted successfully.');
                await ctx.reply("You are all set! 👏 Bot is free to use for 30 days. Any questions? Reach me at KijijiAlertBot@gmail.com");
                userExists = true;
                drawMainMenu(ctx);
              }
              // 30 days in milliseconds
              ctx.session.expDate = Date.now() + 2592000000;
            }
          );

          isValidEmail = true;
        } else {
          await ctx.reply("There is an email address associated with your account, " +
            "if you would like to change your contact email please contact us at KijijiAlertBot@gmail.com");
          userExists = true;
          drawMainMenu(ctx);
        }
      }
    }
  } catch (error) {
    console.log(`❌ Error collecting user email: ${error.message}`);
    console.log(error.stack);
  } finally {
    db.close();
  }
}

async function addLink(conversation, ctx) {
  let isValidURL = false;
  let url;
  let db = new sqlite3.Database('./db/VovaVovaKijijiAlerter_db.db');
    try {
    while (!isValidURL) {
      const { message } = await conversation.wait();
      url = message.text;
      if (url === "Cancel") {
        await ctx.reply("Adding link is cancelled.");
        drawMainMenu(ctx);
        return;
      }
      if (await checkIfValidURL(url)) {
        isValidURL = true;
        //check if url is already in the database
        db.all(`SELECT url FROM Links WHERE chatID = ${ctx.message.chat.id}`, (err, rows) => {
          if (err) {
            console.log(err);
          } else {
            let urlAlreadyInDb = false;
            rows.forEach((row) => {
              if (row.url === url) {
                ctx.reply("This URL is already in the database.");
                urlAlreadyInDb = true;
                drawMainMenu(ctx);
                return;
              }
            }
            );
            if (!urlAlreadyInDb) {
                  // insert url into database
                  db.run(`INSERT INTO Links (url, chatID) VALUES ('${url}', ${ctx.message.chat.id})`);
                  ctx.reply("Search URL added! \nIf patrol is already running don't forget to restart it to include the newly added links (/stop then /patrol)");
                  drawMainMenu(ctx);
              }
          }
        });
      } else {
        await ctx.reply(url + ` is not a valid URL. Please enter a valid URL 🔗 or type "Cancel":`);
      }
    }
    return url;
  } catch (error) {
    console.log(`❌ Error adding link: ${error.message}`);
    console.log(error.stack);
  } finally {
    db.close();
  }
}

// conversation handler to subscribe user with stripe good-better-best pricing
// async function subscribeUser(conversation, ctx) {
//   try {
//     // show client pricing table in the bot using html markup provided by stripe
//     ctx.replyWithHTML(c.get('stripe.pricingTable'));


//     const session = await stripe.checkout.sessions.create({
//       payment_method_types: ['card'],
//       line_items: [
//         {
//           price: c.get('stripe.priceId'),
//           quantity: 1,
//         },
//       ],
//       mode: 'subscription',
//       success_url: `${c.get('stripe.successUrl')}`,
//       cancel_url: `${c.get('stripe.cancelUrl')}`,
//       customer_email: ctx.session.userEmail,
//     });
//     // send stripe session id to user
//     ctx.reply(`Please click on the link below to subscribe: \n${session.url}`);
//   } catch (error) {
//     console.log(`❌ Error subscribing user: ${error.message}`);
//     console.log(error.stack);
//   }
// }



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
  let db = new sqlite3.Database('./db/VovaVovaKijijiAlerter_db.db');
  return new Promise((resolve, reject) => {
      try {
          db.run(
              'UPDATE Users SET patrolActive = ? WHERE chatID = ?;',
              [patrolState, chatID],
              (err) => {
                  if (err) {
                      reject(err);
                  } else {
                      resolve();
                  }
              }
          );
      } catch (error) {
          console.error('Error:', error);
          console.log(error.stack);
      } finally {
        db.close();
      }
  });
}


// Function to check for expired subscriptions and stop the patrol if expired
async function checkForExpiredSubscriptions() {
  let db = new sqlite3.Database('./db/VovaVovaKijijiAlerter_db.db');
  try {
    const currentTime = new Date().toISOString();  // Get current time in ISO format
    db.all(`SELECT chatID FROM Users WHERE patrolActive = TRUE
            AND datetime(expDate) < datetime(?)`, [currentTime], (error, rows) => {
      if (error) {
        console.log(error);
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
  } finally {
    db.close();
  }
}

// Function to draw main menu
async function drawMainMenu(ctx) {
  const menu = new Keyboard()
  .text("/showlinks 📃")
  .text("/addlink ➕").row()
  .text("/patrol 🕵️‍♂️")
  .text("/stop 🛑")
  .text("/subscribe 💵").row()
  .persistent()
  .resized() 
  ctx.reply(
    `You are in the main menu. Please select an option`,
    { reply_markup: menu }
  ); 
}


} catch (err) {
  console.log(`❌ Global Error starting patrol: ${err.message}`);
  console.log(err.stack);
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