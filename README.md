# energy-price-fetcher

Minimal utilities for fetching and normalising Nordic day-ahead electricity prices.
Pick a provider order, and receive a consistent JSON object with hourly or 15-minute prices.

## Install

```bash
npm install energy-price-fetcher
```

## Quick start

```js
const { fetchDayAheadPrices } = require('energy-price-fetcher');

async function main() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const prices = await fetchDayAheadPrices({
    region: 'NO1',
    currency: 'NOK',
    date: today,
    interval: '1h',
    prefer: 'nordpool',
    entsoeToken: process.env.ENTSOE_TOKEN,
  });

  console.log(prices.priceDate, prices.priceProvider);
  console.log(prices.daily);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
```

## API

### `fetchDayAheadPrices(options)`

Fetch day-ahead spot prices and return a normalised structure.

| option | type | default | description |
| --- | --- | --- | --- |
| `region` | string | required | Nord Pool bidding zone (e.g. `NO1`, `NO2`, `SE3`) |
| `currency` | string | `"NOK"` | Output currency. The library converts ENTSO-E EUR prices using a currency provider when required. |
| `date` | string | today | ISO date (`YYYY-MM-DD`) to fetch |
| `interval` | string | `"1h"` | Resolution of the output series, `"1h"` or `"15m"` |
| `prefer` | string | `"nordpool"` | Preferred source (`"nordpool"`, `"entsoe"`) |
| `providers` | array | auto | Override the fallback order by passing an array of providers |
| `entsoeToken` | string | `null` | Required to call the ENTSO-E API (if omitted, ENTSO-E is skipped) |
| `getCurrencyRate` | function | `null` | Async function like `(currencyCode) => number` returning a conversion rate; if omitted and conversion is needed the built-in ECB provider kicks in |
| `currencyFetcherOptions` | object | `{}` | Options for the built-in currency provider (e.g. `{ currencyUrl, disableCache }`) |
| `baseUrls` | object | internal defaults | Override source URLs (`{ nordpool, entsoe }`) |

### Response shape

```jsonc
{
  "priceDate": "2025-10-14",
  "priceProvider": "Nord Pool",
  "priceProviderUrl": "https://…",
  "hourly": [
    {
      "startTime": "2025-10-14T00:00:00+02:00",
      "endTime": "2025-10-14T01:00:00+02:00",
      "spotPrice": 0.4276
    }
  ],
  "daily": {
    "minPrice": 0.1221,
    "maxPrice": 0.4998,
    "avgPrice": 0.2684,
    "peakPrice": 0.3945,
    "offPeakPrice1": 0.1882,
    "offPeakPrice2": 0.1736
  }
}
```

Hourly entries contain *only* spot prices; downstream applications can layer VAT, grid tariffs, contracts, or subsidies however they like.

## Examples

- `examples/cli-fetch.js` — simple CLI that fetches today’s prices and prints the daily summary.
- `examples/rest-server.js` — minimal Express server exposing `GET /api/prices?region=NO1&date=YYYY-MM-DD`.

### Currency helpers

- `createCurrencyRateProvider(options)` returns an async `(code) => rate` function and is exported for custom use. By default the fetcher shares a single provider hitting the ECB daily feed; pass `currencyFetcherOptions` or your own `getCurrencyRate` to customise caching behaviour.

## Notes on data sources

- **Nord Pool** is the canonical source; it returns 1h or 15m data in the requested currency.
- **ENTSO-E** mirrors Nord Pool but occasionally drops 15-minute slots in certain bidding zones. The library falls back gracefully, but you should treat missing points as a warning.

## License

MIT
