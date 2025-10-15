#!/usr/bin/env node

const { fetchDayAheadPrices } = require("../src");

async function main() {
  let  argStart = 2;
  const region = process.argv[argStart++] || "NO1";
  const currency = process.argv[argStart++] || 'NOK';
  const interval = process.argv[argStart++] || "1h";
  const date = process.argv[argStart++] || new Date().toISOString().slice(0, 10);

  const prices = await fetchDayAheadPrices({
    region,
    date,
    interval,
    currency: currency,
    entsoeToken: process.env.ENTSOE_TOKEN,
  });

  console.log(
    JSON.stringify(
      {
        priceDate: prices.priceDate,
        provider: prices.priceProvider,
        providerUrl: prices.priceProviderUrl,
        region: prices.regionCode,
        currency: prices.priceCurrency,
        hourly: prices.hourly,
        daily: prices.daily,
      },
      null,
      2,
    ),
  );
  //console.log(JSON.stringify(prices, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
