import checksum from 'checksum';
import axios  from 'axios';
import cheerio from 'cheerio';
import { sendMessage } from './main.js';

export const generateTopResultsString = async (url) => {
try {
  const HTMLresponse = await axios.get(url);
  const $ = cheerio.load(HTMLresponse.data);
  console.log(`Fetching ${url}`);
  let topResultsString = "";
  let count = 0;


  const ulElements = $('ul[data-testid="srp-search-list"]');

if (ulElements.length > 1) {
  // If there are multiple ul elements, target the second one
  const secondUl = ulElements.eq(1);
  secondUl.find('a[data-testid="listing-link"]').slice(0, 3).each((i, element) => {
    if (count < 3) {
      const href = element.attribs["href"];
      const id = href.substring(href.lastIndexOf("/") + 1);
      topResultsString += `${id}\n`;
      console.log("Top Results String:" + topResultsString);
      count++;
    }
  });
  return topResultsString;
} else if (ulElements.length === 1) {
  // If there's only one ul element, target it
  const firstUl = ulElements.eq(0);
  firstUl.find('a[data-testid="listing-link"]').slice(0, 3).each((i, element) => {
    if (count < 3) {
      const href = element.attribs["href"];
      const id = href.substring(href.lastIndexOf("/") + 1);
      topResultsString += `${id}\n`;
      console.log("Top Results String:\n" + topResultsString);
      count++;
    }
  });

console.log("Top Results String:\n" + topResultsString);
return topResultsString;
} else {
  console.log("No ul elements found");
  return topResultsString;
}
  } catch (err) {
    console.log(`Could not complete fetch of ${url}: ${err}`)
  }

  // OLD CODE:
  // use cheerio to parse HTML response and find all search results
  // then find all ids and concatenate them
  //but only use 3 top regular ads to prevent false positives
//   $('a[data-testid="listing-link"]').slice(0,3).each((i, element) => {
//     if (count < 3) {
//       const href = element.attribs["href"];
//       const id = href.substring(href.lastIndexOf("/") + 1);
//       topResultsString += `${id}\n`;
//       console.log("Apt String:" + topResultsString);
//       count++;
//     }
//   });

//   console.log("Apt String:\n"+ topResultsString); 
  
//   return topResultsString
// } catch (err) {
//   console.log(`Could not complete fetch of ${url}: ${err}`) 
// }
}

// Function to check URLs for updates
export async function checkURLs(sites) {
  console.log(`🕵️  Checking for updates...`);
  sites.forEach(async (site) => {
    await huntForChanges(site);
  });
}

// Rest of the code remains unchanged
// Function to hunt for changes in a specific URL
async function huntForChanges(site) {
  const { url, hash: oldHash, chatId } = site;
  const topResultsString = await generateTopResultsString(url);
  const newHash = checksum(topResultsString);

  console.log("newHash: " + newHash);
  console.log("oldHash: " + oldHash);

  if (newHash !== oldHash) {
    console.log(`💡 There is a new post!`);
    site.hash = newHash;
    const response = buildMessage(url);
    sendMessage(chatId, response); // Send the message to Telegram
    return;
  }

  console.log(`😓 Nothing to report on your search for ${url.split('/')[5]}.`)
}

export const buildMessage = (url) => {

  // This is the position of the search query inside kijiji's URL slug
  const location = url.split('/')[5]
  return {
    body: `
           There are new listings available in your search for ${location} - 
           check them out here:  ${url}
           `
  };
  }

export default {
  checkURLs,
  generateTopResultsString,
  buildMessage,
  huntForChanges
}