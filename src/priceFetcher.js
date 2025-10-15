const { format } = require("date-fns");
const NordPoolClient = require("./providers/nordPoolClient");
const EntsoeClient = require("./providers/entsoeClient");
const { normalizeSeries } = require("./priceSeriesNormalizer");
const { createCurrencyRateProvider } = require("./providers/ecbCurrencyProvider");

let sharedCurrencyRateProvider = null;

async function fetchDayAheadPrices(options = {}) {
  const {
    region,
    currency = "NOK",
    date = new Date(),
    interval = "1h",
    prefer = "nordpool",
    providers,
    entsoeToken = null,
    getCurrencyRate = null,
    baseUrls = {},
    dayHoursStart = 6,
    dayHoursEnd = 22,
    currencyFetcherOptions = {},
  } = options;

  if (!region) {
    throw new Error("region is required (e.g. NO1, SE3, DK1)");
  }

  const targetDate = normalizeDate(date);
  const clientContext = {
    region,
    currency,
    entsoeToken,
    baseUrls,
  };

  let sourceOrder = resolveSourceOrder(providers, prefer);
  if (!entsoeToken) {
    sourceOrder = sourceOrder.filter((source) => source !== "entsoe");
  }

  if (sourceOrder.length === 0) {
    throw new Error("No valid price sources available for the given configuration");
  }
  let lastError;

  for (const source of sourceOrder) {
    try {
      const raw = await fetchFromSource(source, clientContext, targetDate);
      const points = await preparePoints(
        raw.points,
        currency,
        getCurrencyRate,
        currencyFetcherOptions,
      );
      const normalized = normalizeSeries({
        points,
        targetInterval: interval,
      });
      return buildPriceObject({
        priceDate: targetDate.isoDate,
        provider: raw.provider,
        providerUrl: raw.providerUrl,
        hourlySeries: normalized,
        dayHoursStart,
        dayHoursEnd,
        region,
        currency,
      });
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("No price sources available");
}

async function fetchFromSource(source, context, targetDate) {
  const { region, currency, entsoeToken, baseUrls } = context;

  switch (source) {
    case "nordpool": {
      const client = new NordPoolClient({
        region,
        currency,
        baseUrl: baseUrls.nordpool,
      });
      return client.fetch(targetDate.isoDate);
    }
    case "entsoe": {
      const client = new EntsoeClient({
        region,
        token: entsoeToken,
        baseUrl: baseUrls.entsoe,
      });
      return client.fetch(targetDate.date);
    }
    default:
      throw new Error(`Unknown price source: ${source}`);
  }
}

async function preparePoints(
  points,
  targetCurrency,
  getCurrencyRate,
  currencyFetcherOptions,
) {
  if (!Array.isArray(points)) {
    return [];
  }

  let rateProvider = getCurrencyRate;
  const needsConversion = points.some((point) => {
    const sourceCurrency = (point.currency || targetCurrency).toUpperCase();
    const desiredCurrency = (targetCurrency || sourceCurrency).toUpperCase();
    return sourceCurrency !== desiredCurrency;
  });

  if (!rateProvider && needsConversion) {
    rateProvider = getDefaultCurrencyRateProvider(currencyFetcherOptions);
  }

  if (!rateProvider && needsConversion) {
    throw new Error(
      "Currency conversion required but no currency rate provider is available",
    );
  }

  const prepared = [];

  for (const point of points) {
    const sourceCurrency = (point.currency || targetCurrency).toUpperCase();
    const desiredCurrency = (targetCurrency || sourceCurrency).toUpperCase();
    let value = Number(point.value);

    if (sourceCurrency !== desiredCurrency) {
      value = await convertCurrency(
        value,
        sourceCurrency,
        desiredCurrency,
        rateProvider,
      );
    }

    prepared.push({
      start: point.start,
      end: point.end,
      value,
      currency: desiredCurrency,
    });
  }

  return prepared;
}

async function convertCurrency(value, fromCurrency, toCurrency, getRate) {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();

  if (from === to) {
    return value;
  }

  let amountInEur = value;

  if (from !== "EUR") {
    const fromRate = await getRate(from);
    if (!fromRate) {
      throw new Error(`Missing currency rate for ${from}`);
    }
    amountInEur = value / fromRate;
  }

  if (to === "EUR") {
    return amountInEur;
  }

  const toRate = await getRate(to);
  if (!toRate) {
    throw new Error(`Missing currency rate for ${to}`);
  }

  return amountInEur * toRate;
}

function getDefaultCurrencyRateProvider(options = {}) {
  const optionKeys = Object.keys(options || {});
  if (optionKeys.length > 0) {
    return createCurrencyRateProvider(options);
  }
  if (!sharedCurrencyRateProvider) {
    sharedCurrencyRateProvider = createCurrencyRateProvider();
  }
  return sharedCurrencyRateProvider;
}

function buildPriceObject({
  priceDate,
  provider,
  providerUrl,
  hourlySeries,
  dayHoursStart,
  dayHoursEnd,
  region,
  currency,
}) {
  const hourly = [];
  let minPrice = Number.POSITIVE_INFINITY;
  let maxPrice = Number.NEGATIVE_INFINITY;

  for (const entry of hourlySeries) {
    const spotPrice = parseFloat(entry.value.toFixed(4));
    hourly.push({
      startTime: entry.start,
      endTime: entry.end,
      spotPrice,
    });
    minPrice = Math.min(minPrice, spotPrice);
    maxPrice = Math.max(maxPrice, spotPrice);
  }

  const daily = buildDailyStats(
    hourly,
    minPrice,
    maxPrice,
    dayHoursStart,
    dayHoursEnd,
  );

  return {
    priceDate,
    priceProvider: provider,
    priceProviderUrl: providerUrl,
    regionCode: region,
    priceCurrency: currency,
    hourly,
    daily,
  };
}

function buildDailyStats(hourly, minPrice, maxPrice, dayHoursStart, dayHoursEnd) {
  if (!hourly.length) {
    return {
      minPrice: 0,
      maxPrice: 0,
      avgPrice: 0,
      peakPrice: 0,
      offPeakPrice1: 0,
      offPeakPrice2: 0,
    };
  }

  const avg =
    hourly.reduce((acc, entry) => acc + entry.spotPrice, 0) / hourly.length;

  const entriesPerHour = hourly.length > 48 ? 4 : 1;
  const startIndex = dayHoursStart * entriesPerHour;
  const endIndex = Math.max(startIndex, dayHoursEnd * entriesPerHour - 1);

  const peak =
    averageCalc(hourly, "spotPrice", startIndex, endIndex) || 0;
  const offPeak1 = averageCalc(hourly, "spotPrice", 0, startIndex - 1) || 0;
  const offPeak2 =
    averageCalc(hourly, "spotPrice", endIndex + 1, hourly.length - 1) || 0;

  return {
    minPrice: parseFloat(minPrice.toFixed(4)),
    maxPrice: parseFloat(maxPrice.toFixed(4)),
    avgPrice: parseFloat(avg.toFixed(4)),
    peakPrice: parseFloat(peak.toFixed(4)),
    offPeakPrice1: parseFloat(offPeak1.toFixed(4)),
    offPeakPrice2: parseFloat(offPeak2.toFixed(4)),
  };
}

function averageCalc(arr, key, start = 0, end) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  if (end === undefined) {
    end = arr.length - 1;
  }
  start = start < 0 ? 0 : start;
  end = end >= arr.length ? arr.length - 1 : end;

  let sum = 0;
  let count = 0;

  for (let i = start; i <= end; i++) {
    if (arr[i] && arr[i][key] !== undefined) {
      sum += arr[i][key];
      count++;
    }
  }

  return count > 0 ? sum / count : null;
}

function resolveSourceOrder(override, prefer) {
  const canonical = ["nordpool", "entsoe"];
  if (Array.isArray(override) && override.length) {
    return override.map((src) => src.toLowerCase());
  }
  const preferred = typeof prefer === "string" ? prefer.toLowerCase() : "nordpool";
  if (!canonical.includes(preferred)) {
    return canonical;
  }
  return [preferred, ...canonical.filter((src) => src !== preferred)];
}

function normalizeDate(dateInput) {
  const date =
    typeof dateInput === "string" ? new Date(dateInput) : new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date supplied: ${dateInput}`);
  }
  return {
    date,
    isoDate: format(date, "yyyy-MM-dd"),
  };
}

module.exports = fetchDayAheadPrices;
