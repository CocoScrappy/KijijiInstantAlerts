import c from 'config';
import { sendMessage, addedToSetWithLimit, refreshPage } from './main.js';
import cheerio from 'cheerio';

export async function checkURLs(links, browser) {
  const startTimestamp = performance.now();
  try {
  console.log(`🕵️ Checking..`);
  const maxConcurrency = 3;
  const chunks = [];
  for (let i = 0; i < links.length; i += maxConcurrency) {
    chunks.push(links.slice(i, i + maxConcurrency));
  }

    await Promise.all(
      chunks.map(async chunk => {
        await Promise.all(chunk.map(link => huntForChanges(link, browser)));
      })
    );
    //links.length = 0;
    chunks.length = 0;
  } catch (error) {
    console.error(`Error during URL checking: ${error}`);
    // Handle the error as needed
  }
  const endTimestamp = performance.now();
  const completionTime = endTimestamp - startTimestamp;
  console.log(`Execution completed in  ${completionTime / 1000} seconds.`);
}

async function huntForChanges(userLink, browser) {
  try {
    const topID = await fetchLink(userLink, browser);
    console.log(`🔍 Checking ${userLink.url} for changes..`+
    `Top ID: ${topID}`
    );
    if (!topID) {
      throw new Error(`❌ Could not fetch ${userLink.url}`);
    }
    const addedToSet = await addedToSetWithLimit(userLink.topLinks, topID);

    if (addedToSet) {
      const response = buildMessage(userLink);
      sendMessage(userLink.chatId, response);
      console.log(`💡 There is a new post! Top ads: ${ Array.from(userLink.topLinks)}`);
    } else {
      //console.log(`😓 Nothing to report on your search for ${userLink.url}.`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    console.log(`❌ Error: ${error.stack}`);
  }
}

export const fetchLink = async (userLink, browser) => {
  try {
    const HTMLresponse = await refreshPage(browser, userLink);
    if (!HTMLresponse) {
      throw new Error(`❌ Could not refresh ${userLink.url}`);
    } else {
      const $ = cheerio.load(HTMLresponse);
      //console.log(`Refreshing and parsing ${userLink.url}`);
      const topID = parseForTopID($, userLink);
      return topID;
    }
  } catch (err) {
    console.log(`❌ Could not complete fetch of ${userLink.url}: ${err}`);
    return "";
  }
}

// only return 1st (top) ad id
export const parseForTopID = ($, userLink) => {
  try {
    const ulElements = $('ul[data-testid="srp-search-list"]');
    if (ulElements.length > 0) {
      const targetUl = ulElements.length > 1 ? ulElements.eq(1) : ulElements.eq(0);
      //const targetListing = targetUl.find('li[data-testid="listing-card-list-item-0"]').eq(0);
      const targetListing = targetUl.find('section[data-testid="listing-card"]').eq(0);
      
      const prices = targetUl.find('p[data-testid*="listing-price"]');
      const href = targetListing.find('a[data-testid="listing-link"]').eq(0).attr("href");
      const liItem = targetListing.find('ul[data-testid*="list-non-mobile"]').children('li');
      const divItem = targetListing.find('div[data-testid*="autos-attribute"]').children('p');
      if (href) {
        userLink.price = prices.eq(0).text();
        userLink.attr1 = "";
        userLink.attr2 = "";
        if (liItem.eq(0).text()) {
          userLink.attr1 = liItem.eq(0).text().concat(" | " + liItem.eq(1).text());
        }
        //console.log("divItem: " + divItem.eq(0).text());
        if (divItem.eq(0).text()) {
          userLink.attr2 = divItem.eq(0).text().concat(" " + divItem.eq(1).text());
        }
        userLink.newAdUrl = "https://www.kijiji.ca" + href;
        // console.log("Price!: " + userLink.price);
        // console.log("Attr1!: " + userLink.attr1);
        // console.log("Attr2!: " + userLink.attr2);
        const id = href.substring(href.lastIndexOf("/") + 1);
        return id;
      } 
    } else {
      console.log("No ul elements found");
      return "";
    }
  } catch (error) {
    console.log(`❌ Error in parseForTopID: ${error.message}`);
    return "";
  }
}


export const generateInitialSetForPatrol = ($, userLink) => {
  let initialSetForPatrol = new Set();
  try {
    const ulElements = $('ul[data-testid="srp-search-list"]');

    if (ulElements.length > 0) {
      const targetUl = ulElements.length > 1 ? ulElements.eq(1) : ulElements.eq(0);
      //const targetListing = targetUl.find('li[data-testid="listing-card-list-item-0"]').eq(0);
      const targetListing = targetUl.find('section[data-testid="listing-card"]').eq(0);
      const prices = targetUl.find('p[data-testid*="listing-price"]');
      const liItem = targetListing.find('ul[data-testid*="list-non-mobile"]').children('li');
      const divItem = targetListing.find('div[data-testid*="autos-attribute"]').children('p');
      targetUl.find('a[data-testid="listing-link"]').slice(0, 4).each((i, element) => {
        const href = element.attribs["href"];
        if (i === 0) {
          userLink.price = prices.eq(0).text();
          userLink.attr1 = "";
          userLink.attr2 = "";
          if (liItem.eq(0).text()) {
            userLink.attr1 = liItem.eq(0).text().concat(" | " + liItem.eq(1).text());
          }
          if (divItem.eq(0).text()) {
            userLink.attr2 = divItem.eq(0).text().concat(" | " + divItem.eq(1).text());
          }
          userLink.newAdUrl = "https://www.kijiji.ca" + href;
          // console.log("Price!: " + userLink.price);
          // console.log("Attr1!: " + userLink.attr1);
          // console.log("Attr2!: " + userLink.attr2);
        }
        const id = href.substring(href.lastIndexOf("/") + 1);
        initialSetForPatrol.add(id);
      });
    //console.log("Initial Set: " + Array.from(initialSetForPatrol));
  } else {
    console.log("No ul elements found");
  }

  return initialSetForPatrol;
  } catch (error) {
    console.log(`❌ Error in generateInitialSetForPatrol: ${error.message}`);
    console.log(`❌ Error in generateInitialSetForPatrol: ${error.stack}`);
    return initialSetForPatrol;
  }
}

export const buildMessage = (userLink) => {
  // console.log("Build Message -> search Object!: " + JSON.stringify(userLink));
  return `${userLink.newAdUrl}\nPrice: ${userLink.price}\nInfo: ${userLink.attr1} ${userLink.attr2}`;
}



export default {
  checkURLs,
  fetchLink,
  huntForChanges,
  buildMessage,
  parseForTopID,
  generateInitialSetForPatrol
}