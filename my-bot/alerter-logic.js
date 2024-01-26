import { sendMessage, addedToSetWithLimit } from './main.js';
import fs from 'fs';
import axios from 'axios';
import cheerio from 'cheerio';
import c from 'config';

export async function checkURLs(links) {
  console.log(`🕵️ Checking for updates...`);
  await Promise.all(links.map(huntForChanges));
}

async function huntForChanges(userLink) {
  try {
    const topID = await fetchLinks(userLink);
    if (!topID) {
      const error = `❌ Error: topLinks is undefined for user: ${userLink.chatID}, url: ${userLink.url}`;
      console.log(error);
      return;
    }
    const addedToSet = await addedToSetWithLimit(userLink.topLinks, topID);

    if (addedToSet) {
      const response = buildMessage(userLink);
      sendMessage(userLink.chatId, response);
      console.log(`💡 There is a new post!`);
      console.log(`📝 Top ads: ${ Array.from(userLink.topLinks)}`);
    } else {
      console.log(`😓 Nothing to report on your search for ${userLink.url.split('/')[5]}.`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    console.log(`❌ Error: ${error.stack}`);
  }
}

export const fetchLinks = async (userLink) => {
  try {
    const HTMLresponse = await axios.get(userLink.url);
    if (HTMLresponse.status !== 200) {
      console.log(`Error fetching ${userLink.url}: ${HTMLresponse.status}`);
      return "";
    }
    const $ = cheerio.load(HTMLresponse.data);
    console.log(`Fetching ${userLink.url}`);
    // return the the most recent top ad id if there is one
    const topID = await parseForTopID($, userLink);
    return topID;
  } catch (err) {
    console.log(`❌ Could not complete fetch of ${userLink.url}: ${err}`);
    return "";
  }
}

// only return 1st (top) ad id
export const parseForTopID = ($, userLink) => {
  try {
    const ulElements = $('ul[data-testid="srp-search-list"]');
    console.log("ULELEMENTS length: " + ulElements.length);
    if (ulElements.length > 0) {
      const targetUl = ulElements.length > 1 ? ulElements.eq(1) : ulElements.eq(0);
      const targetListing = targetUl.find('li[data-testid="listing-card-list-item-0"]').eq(0);
      const prices = targetUl.find('p[data-testid="listing-price"]');
      const href = targetListing.find('a[data-testid="listing-link"]').eq(0).attr("href");
      const liItem = targetListing.find('ul[data-testid="attribute-list-non-mobile"]').children('li');
      console.log("liItem: " + liItem.text());
      if (href) {
        userLink.price = prices.eq(0).text();
        userLink.attr1 = liItem.eq(0).text() || "N/A";
        userLink.attr2 = liItem.eq(1).text() || "N/A";
        userLink.newAdUrl = "https://www.kijiji.ca" + href;
        console.log("Price!: " + userLink.price);
        console.log("Attr1!: " + userLink.attr1);
        console.log("Attr2!: " + userLink.attr2);
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
      const targetListing = targetUl.find('li[data-testid="listing-card-list-item-0"]').eq(0);
      const prices = targetUl.find('p[data-testid="listing-price"]');
      const liItem = targetListing.find('ul[data-testid="attribute-list-non-mobile"]').children('li');
      targetUl.find('a[data-testid="listing-link"]').slice(0, 4).each((i, element) => {
        const href = element.attribs["href"];
        if (i === 0) {
          userLink.price = prices.eq(0).text();
          userLink.attr1 = liItem.eq(0).text() || "N/A";
          userLink.attr2 = liItem.eq(1).text() || "N/A";
          userLink.newAdUrl = "https://www.kijiji.ca" + href;
          console.log("Price!: " + userLink.price);
          console.log("Attr1!: " + userLink.attr1);
          console.log("Attr2!: " + userLink.attr2);
        }
        const id = href.substring(href.lastIndexOf("/") + 1);
        initialSetForPatrol.add(id);
      });
    console.log("Initial Set: " + Array.from(initialSetForPatrol));
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
  console.log("Build Message -> search Object!: " + JSON.stringify(userLink));
  return `${userLink.newAdUrl}\nPrice: ${userLink.price}\nAttr1: ${userLink.attr1}\nAttr2: ${userLink.attr2}`;
}

export default {
  checkURLs,
  fetchLinks,
  huntForChanges,
  buildMessage
}