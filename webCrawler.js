const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

function waitForNetworkIdle(page, timeout, maxInflightRequests = 0) {
  page.on("request", onRequestStarted);
  page.on("requestfinished", onRequestFinished);
  page.on("requestfailed", onRequestFinished);

  let inflight = 0;
  let fulfill;
  let promise = new Promise((x) => (fulfill = x));
  let timeoutId = setTimeout(onTimeoutDone, timeout);
  return promise;

  function onTimeoutDone() {
    page.removeListener("request", onRequestStarted);
    page.removeListener("requestfinished", onRequestFinished);
    page.removeListener("requestfailed", onRequestFinished);
    fulfill();
  }

  function onRequestStarted() {
    ++inflight;
    if (inflight > maxInflightRequests) clearTimeout(timeoutId);
  }

  function onRequestFinished() {
    if (inflight === 0) return;
    --inflight;
    if (inflight === maxInflightRequests)
      timeoutId = setTimeout(onTimeoutDone, timeout);
  }
}
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
function flightIsValid(attributes) {
  if (attributes.length <= 17 || attributes[5] == "Oslo") {
    return true;
  } else {
    return false;
  }
}
function makeCombinations(flights) {
  combinations = [];

  for (var i = 0; i < flights.length; i++) {
    for (var j = 0; j < flights.length; j++) {
      if (flights[i].depAirport == "ARN" && flights[j].depAirport !== "ARN") {
        combinations.push({
          to: flights[i],
          from: flights[j],
        });
      }
    }
  }

  require("fs").writeFile(
    "./rez.json",

    JSON.stringify(combinations),

    function (err) {
      if (err) {
        console.error("Error while writing to file");
      }
    }
  );
  console.log("Crawling done");
}
function getFlight(detailsText, text) {
  let forDeletion = ["", " ", "-", " "];
  detailElements = detailsText.split(" ");
  detailElements = detailElements.filter((item) => !forDeletion.includes(item));
  elements = text.split(" ");
  elements = elements.filter((item) => !forDeletion.includes(item));

  if (!flightIsValid(detailElements)) {
    return null;
  }

  let prices = elements.slice(0, 5);

  for (let i = 0; i < prices.length; i++) {
    prices[i] = parseFloat(prices[i].replace("€", "").replace(",", "."));
  }

  var indexOfLowestValue = prices.reduce(
    (iMax, x, i, arr) => (x < arr[iMax] ? i : iMax),
    0
  );
  if (elements[elements.length - 2] == "ARN") {
    var depDate = "2021-09-08 " + elements[5];
    var arrDate = "2021-09-08 " + elements[6];
    if (elements.length == 11) {
      arrDate = "2021-09-09 " + elements[6];
    }
  } else {
    var depDate = "2021-09-15 " + elements[5];
    var arrDate = "2021-09-15 " + elements[6];
    if (elements.length == 11) {
      arrDate = "2021-09-16 " + elements[6];
    }
  }

  return {
    depAirport: elements[elements.length - 2],
    arrAirport: elements[elements.length - 1],
    connAirport: detailElements.length <= 17 ? "none" : "OSL",
    depTime: depDate,
    arrTime: arrDate,
    price: prices[indexOfLowestValue],
  };
}

(async () => {
  const cookies = [
    {
      name: "SASLastSearch",
      value:
        "%7B%22origin%22:%22ARN%22,%22destination%22:%22LHR%22,%22outward%22:%2220210908%22,%22inward%22:%2220210915%22,%22adults%22:%221%22,%22children%22:%220%22,%22infants%22:%220%22,%22youths%22:%22NaN%22,%22lpc%22:%22false%22,%22oneway%22:%22false%22,%22rtf%22:%22false%22,%22rcity%22:%22false%22%7D",
    },
  ];
  puppeteer.use(StealthPlugin());
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto("https://classic.flysas.com/en/de", {
    waitUntil: "networkidle2",
  });
  await page.setCookie(...cookies);
  await sleep(3000);
  await page.reload({ waitUntil: ["networkidle0", "domcontentloaded"] });
  await sleep(3000);

  await page.evaluate(() => {
    try {
      WebForm_DoPostBackWithOptions(
        new WebForm_PostBackOptions(
          "ctl00$FullRegion$MainRegion$ContentRegion$ContentFullRegion$ContentLeftRegion$CEPGroup1$CEPActive$cepNDPRevBookingArea$Searchbtn$ButtonLink",
          "",
          true,
          "",
          "",
          false,
          true
        )
      );
    } catch (e) {
      console.log(e);
    }
  });
  await Promise.all([waitForNetworkIdle(page, 1500, 0)]);
  var flights = [];
  try {
    const text = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll(".segmented"),
        (element) => element.textContent
      )
    );
    const detailsText = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll(".segments"),
        (element) => element.textContent
      )
    );

    for (let i = 0; i < text.length; i++) {
      let tempObj = getFlight(detailsText[i], text[i]);
      if (tempObj) {
        flights.push(tempObj);
      }
    }
    makeCombinations(flights);
  } catch (e) {
    console.log(e);
  }
})();
