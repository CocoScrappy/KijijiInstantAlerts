import checksum from 'checksum';
import axios  from 'axios';
import cheerio from 'cheerio';
import { sendMessage } from './main.js';
import fs from 'fs';

export const generateTopResultsString = async (url) => {
try {
  const HTMLresponse = await axios.get(url);
  //handle all cases of status code other than 200
  if (HTMLresponse.status !== 200) {
    console.log(`Error fetching ${url}: ${HTMLresponse.status}`);
    return;
  }
  const $ = cheerio.load(HTMLresponse.data);
  console.log(`Fetching ${url}`);
  //let msgHref;
  let topResultsString = "";
  // handle case of (data-testid="zero-results-page")
  const zeroResults = true ? $('div[data-testid="zero-results-page"]').length > 0 : false;
  if (zeroResults) {
    console.log("No results found");
    return topResultsString;
  }

  // handle case of (data-testid="srp-search-list") existing
  const ulElements = $('ul[data-testid="srp-search-list"]');

if (ulElements.length > 1) {
  // If there are multiple ul elements, target the second one
  const secondUl = ulElements.eq(1);
  secondUl.find('a[data-testid="listing-link"]').slice(0, 3).each((i, element) => {
    if (i < 3) {
      const href = element.attribs["href"];
      // if (i===0) {
      //   msgHref = "https://www.kijiji.ca" + href;
      // }
      const id = href.substring(href.lastIndexOf("/") + 1);
      topResultsString += `\n${id}`;
    }
  });
  console.log("Top Results String:" + topResultsString);
  // topResultsObj = {
  //   topResultsString : topResultsString,
  //   msgHref : msgHref
  // };
  return topResultsString;
} else if (ulElements.length === 1) {
  // If there's only one ul element, target it
  const firstUl = ulElements.eq(0);
  firstUl.find('a[data-testid="listing-link"]').slice(0, 3).each((i, element) => {
    if (i < 3) {
      const href = element.attribs["href"];
      // if (i===0) {
      //   msgHref = "https://www.kijiji.ca" + href;
      // }
      const id = href.substring(href.lastIndexOf("/") + 1);
      topResultsString += `\n${id}`;
    }
  });
  // topResultsObj = {
  //   topResultsString : topResultsString,
  //   msgHref : msgHref
  // };
console.log("Top Results String:\n" + topResultsString);
return topResultsString;
} else {
  console.log("No ul elements found");
  // topResultsObj = {
  //   topResultsString : topResultsString,
  //   msgHref : msgHref
  // };
  return topResultsString;
}
  } catch (err) {
    console.log(`Could not complete fetch of ${url}: ${err}`)
  }
}

// Function to check URLs for updates
export async function checkURLs(sites) {
  console.log(`🕵️  Checking for updates...`);
  sites.forEach(async (site) => {
    console.log(`current time: ${new Date().toLocaleString()}   site: ${site.url}`);
    await huntForChanges(site);
  });
}

// Function to hunt for changes in a specific URL
async function huntForChanges(site) {
  const { url, hash: oldHash, chatId } = site;
  try {
    const topResultsString = await generateTopResultsString(url);
    // checks if topResultsString is not undefined
    if (topResultsString === undefined) {
      console.log(`❌ Error: topResultsString is undefined for ${url}`);
      const fullerr =  `❌ Error: topResultsString is undefined for ${url}`;
      // remove fs undefined error
      fs.writeFile('error.txt', fullerr , (err) => {
        if (err) throw err;
        console.log('Error was written to file successfully!');
      });
      return;
    } else {
    const newHash = checksum(topResultsString);
    if ((newHash !== oldHash) && (newHash !== "")) {
      console.log(`💡 There is a new post!`);
      site.hash = newHash;
      //site.newAdUrl = topResultsObj.msgHref;
      const response = buildMessage(url);
      sendMessage(chatId, response); // Send the message to Telegram
      return;
    }
    console.log(`😓 Nothing to report on your search for ${url.split('/')[5]}.`);
    return;
  }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

export const buildMessage = (url) => {

  // This is the position of the search query inside kijiji's URL slug
  return {
    body: `${url}`
  };
  }

export default {
  checkURLs,
  generateTopResultsString,
  huntForChanges,
  buildMessage
}