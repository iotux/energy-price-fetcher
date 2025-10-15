const axios = require("axios");
const convert = require("xml-js");

const DEFAULT_CURRENCY_URL =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

function createCurrencyRateProvider(options = {}) {
  const {
    currencyUrl = DEFAULT_CURRENCY_URL,
    disableCache = false,
    clock = () => new Date(),
    fetcher = defaultFetch,
  } = options;

  let cached = null;

  return async function getCurrencyRate(currencyCode) {
    const code = (currencyCode || "EUR").toUpperCase();

    if (code === "EUR") {
      return 1;
    }

    if (!disableCache) {
      const today = clock().toISOString().split("T")[0];
      if (!cached || cached.date !== today) {
        cached = await fetchRates(currencyUrl, fetcher);
      }
    }

    if (disableCache || !cached) {
      cached = await fetchRates(currencyUrl, fetcher);
    }

    if (!cached.rates || cached.rates[code] === undefined) {
      throw new Error(`Currency rate for ${code} not available`);
    }

    return Number(cached.rates[code]);
  };
}

async function fetchRates(currencyUrl, fetcher) {
  const xml = await fetcher(currencyUrl);
  const data = convert.xml2js(xml, { compact: true, spaces: 2 });
  const root = data["gesmes:Envelope"];
  if (!root || !root.Cube || !root.Cube.Cube) {
    throw new Error("Unexpected currency XML structure");
  }

  const cubeRoot = root.Cube.Cube;
  const timeAttr = cubeRoot._attributes && cubeRoot._attributes.time;
  if (!timeAttr) {
    throw new Error("Currency feed missing date attribute");
  }

  const childCubes = Array.isArray(cubeRoot.Cube)
    ? cubeRoot.Cube
    : [cubeRoot.Cube];

  const rates = childCubes.reduce(
    (acc, cube) => {
      if (
        cube &&
        cube._attributes &&
        cube._attributes.currency &&
        cube._attributes.rate
      ) {
        acc[cube._attributes.currency.toUpperCase()] = Number(
          cube._attributes.rate,
        );
      }
      return acc;
    },
    { EUR: 1 },
  );

  return {
    status: "OK",
    fetchedAt: new Date().toISOString(),
    source: currencyUrl,
    date: timeAttr,
    base: "EUR",
    rates,
  };
}

async function defaultFetch(url) {
  const response = await axios.get(url, {
    headers: {
      accept: "application/xml",
      "Content-Type": "text/xml",
    },
  });
  if (response.status !== 200) {
    throw new Error(
      `Currency fetch error ${response.status}: ${response.statusText}`,
    );
  }
  return response.data;
}

module.exports = {
  createCurrencyRateProvider,
};
