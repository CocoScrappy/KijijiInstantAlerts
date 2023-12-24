import checksum from 'checksum';
import axios from 'axios';
import cheerio from 'cheerio';
import { sendMessage } from './main.js';
import fs from 'fs';
import c from 'config';

export async function checkURLs(links) {
  console.log(`🕵️ Checking for updates...`);
  await Promise.all(links.map(huntForChanges));
}

async function huntForChanges(link) {
  try {
    const topResultsString = await processSearch(link);
    if (!topResultsString) {
      const error = `❌ Error: topResultsString is undefined for ${link.url}`;
      fs.writeFile('error.txt', error, (err) => {
        if (err) throw err;
        console.log('Error was written to file successfully!');
      });
      return;
    }

    const newHash = checksum(topResultsString);

    if (newHash !== link.hash && topResultsString !== "") {
      console.log(`💡 There is a new post!`);
      console.log(`📝 Old hash: ${link.hash}`);
      console.log(`📝 New hash: ${newHash}`);
      link.hash = newHash;
      const response = buildMessage(link);
      sendMessage(link.chatId, response, bot);
    } else {
      console.log(`😓 Nothing to report on your search for ${link.url.split('/')[5]}.`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

export const processSearch = async (link) => {
  try {
    const HTMLresponse = await axios.get(link.url);

    if (HTMLresponse.status !== 200) {
      console.log(`Error fetching ${link.url}: ${HTMLresponse.status}`);
      return "";
    }

    const $ = cheerio.load(HTMLresponse.data);
    console.log(`Fetching ${link.url}`);

    const topResultsString = generateTopResultsString($, link);
    return topResultsString;
  } catch (err) {
    console.log(`❌ Could not complete fetch of ${link.url}: ${err}`);
    return "";
  }
}

const generateTopResultsString = ($, link) => {
  try {
    let topResultsString = "";
    const ulElements = $('ul[data-testid="srp-search-list"]');

    if (ulElements.length > 0) {
      const targetUl = ulElements.length > 1 ? ulElements.eq(1) : ulElements.eq(0);
      const targetListing = targetUl.find('li[data-testid="listing-card-list-item-0"]').eq(0);
      const prices = targetUl.find('p[data-testid="listing-price"]');
      const liItem = targetListing.find('ul[data-testid="attribute-list-non-mobile"]').children('li');
console.log("liItem: " + liItem.text()); 

      targetUl.find('a[data-testid="listing-link"]').slice(0, 3).each((i, element) => {
        const href = element.attribs["href"];
        if (i === 0) {
          link.price = prices.eq(0).text();
          link.attr1 = liItem.eq(0).text() || "Not specified";
          link.attr2 = liItem.eq(1).text() || "Not specified";
          link.newAdUrl = "https://www.kijiji.ca" + href;
          console.log("Price!: " + link.price);
          console.log("Attr1!: " + link.attr1);
          console.log("Attr2!: " + link.attr2);
        }
        const id = href.substring(href.lastIndexOf("/") + 1);
        topResultsString += `\n${id}`;
      });
    } else {
      console.log("No ul elements found");
    }

    return topResultsString;
  } catch (error) {
    console.log(`❌ Error in generateTopResultsString: ${error.message}`);
    return "";
  }
}

export const buildMessage = (link) => {
  console.log("Build Message -> search Object!: " + JSON.stringify(link));
  return `${link.newAdUrl}\nPrice: ${link.price}\nAttr1: ${link.attr1}\nAttr2: ${link.attr2}`;
}

export default {
  checkURLs,
  processSearch,
  huntForChanges,
  buildMessage
}






// import checksum from 'checksum';
// import axios  from 'axios';
// import cheerio from 'cheerio';
// import { sendMessage } from './main.js';
// import fs from 'fs';
// import c from 'config';



// // Function to check URLs for updates
// export async function checkURLs(searches) {
//   console.log(`🕵️  Checking for updates...`);
//   searches.forEach(async (search) => {
//     console.log(`current time: ${new Date().toLocaleString()} \nsite: ${search.url}`);
//     await huntForChanges(search);
//   });
// }

// // Function to hunt for changes in a specific URL
// async function huntForChanges(search) {
//   //const { url, hash: oldHash, newAdUrl, chatId, price, attr1, attr2 } = search;
//   try {
//     const topResultsString = await generateTopResultsString(search);
//     // checks if topResultsString is not undefined
//     if (topResultsString === undefined) {
//       console.log(`❌ Error: topResultsString is undefined for ${search.url}`);
//       const fullerr =  `❌ Error: topResultsString is undefined for ${search.url}`;
//       // remove fs undefined error
//       fs.writeFile('error.txt', fullerr , (err) => {
//         if (err) throw err;
//         console.log('Error was written to file successfully!');
//       });
//       return;
//     } else {
//     const newHash = checksum(topResultsString);
//     if ((newHash !== search.hash) && (topResultsString !== "")) {
//       console.log(`💡 There is a new post!`);
//       console.log(`📝 Old hash: ${search.hash}`);
//       console.log(`📝 New hash: ${newHash}`);
//       search.hash = newHash;
//       //site.newAdUrl = topResultsObj.msgHref;
//       const response = buildMessage(search);
//       sendMessage(search.chatId, response); // Send the message to Telegram
//       return;
//     }
//     console.log(`😓 Nothing to report on your search for ${search.url.split('/')[5]}.`);
//     return;
//   }
//   } catch (error) {
//     console.log(`❌ Error: ${error.message}`);
//   }
// }

// export const generateTopResultsString = async (search) => {
//   try {
//     let topResultsString;
//     const HTMLresponse = await axios.get(search.url);
//     //handle all cases of status code other than 200
//     if (HTMLresponse.status !== 200) {
//       console.log(`Error fetching ${search.url}: ${HTMLresponse.status}`);
//       return topResultsString;
//     }
//     const $ = cheerio.load(HTMLresponse.data);
//     console.log(`Fetching ${search.url}`);
//     topResultsString = "";
//     // handle case of (data-testid="zero-results-page")
//     const zeroResults = true ? $('div[data-testid="zero-results-page"]').length > 0 : false;
//     if (zeroResults) {
//       console.log("No results found");
//       return topResultsString;
//     }
  
//     // handle case of (data-testid="srp-search-list") existing
//     const ulElements = $('ul[data-testid="srp-search-list"]');

//   if (ulElements.length > 1) {
//     // If there are multiple ul elements, target the second one
//     const secondUl = ulElements.eq(1);
//     const prices = secondUl.find('p[data-testid="listing-price"]');
//     const attribs1 = secondUl.find('ul[data-testid="attribute-list-non-mobile"]').children('li');
//     const attribs2 = secondUl.find('ul[data-testid="attribute-list-non-mobile"]').children('li');

//     secondUl.find('a[data-testid="listing-link"]').slice(0, 3).each((i, element) => {
//       if (i < 3) {
//         const href = element.attribs["href"];
//         if (i===0) {
//           search.newAdUrl = "https://www.kijiji.ca" + href;
//           search.price = prices.eq(0).text();
//           search.attr1 = attribs1.eq(0).children('p').text();
//           search.attr2 = attribs2.eq(1).children('p').text();

//           console.log("Price!: " + search.price);
//           console.log("Attr1!: " + search.attr1);
//           console.log("Attr2!: " + search.attr2);
//         }
//         const id = href.substring(href.lastIndexOf("/") + 1);
//         topResultsString += `\n${id}`;
//       }
//     });
//     console.log("Top Results String:" + topResultsString);
//     console.log("First If -> search Object!: " + JSON.stringify(search));

//     return topResultsString;
//   } else if (ulElements.length === 1) {
//     // If there's only one ul element, target it
//     const firstUl = ulElements.eq(0);
//     const prices = firstUl.find('p[data-testid="listing-price"]');
//     const attribs1 = firstUl.find('ul[data-testid="attribute-list-non-mobile"]').children('li');
//     const attribs2 = firstUl.find('ul[data-testid="attribute-list-non-mobile"]').children('li');
//     //console.log("firstUl: " + JSON.stringify(firstUl));
//     firstUl.find('a[data-testid="listing-link"]').slice(0, 3).each((i, element) => {
//       if (i < 3) {
//         const href = element.attribs["href"];
//         if (i===0) {
//           search.newAdUrl = "https://www.kijiji.ca" + href;
//           search.price = prices.eq(0).text();
//           search.attr1 = attribs1.eq(0).children('p').text();
//           search.attr2 = attribs2.eq(1).children('p').text();
//         }
//         const id = href.substring(href.lastIndexOf("/") + 1);
//         topResultsString += `\n${id}`;
//       }
//     });
//   console.log("Top Results String:\n" + topResultsString);
//   console.log("Else If -> search Object!: " + JSON.stringify(search));
//   return topResultsString;
//   } else {
//     console.log("No ul elements found");
//     return topResultsString;
//   }
//     } catch (err) {
//       console.log(`Could not complete fetch of ${search.url}: ${err}`)
//     }
//   }

// export const buildMessage = (search) => {
//   console.log("Build Message -> search Object!: " + JSON.stringify(search));
//   // This is the position of the search query inside kijiji's URL slug
//   return search.newAdUrl + "\n" + "Price: " + search.price + "\n" + "Attr1: " + search.attr1 + "\n" + "Attr2: " + search.attr2;
//   }

// export default {
//   checkURLs,
//   generateTopResultsString,
//   huntForChanges,
//   buildMessage
// }