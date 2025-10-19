const {
  fetchCurrencies,
  fetchCurrency,
} = require("currency-rate-fetcher");

function createCurrencyRateProvider(options = {}) {
  const {
    provider = "ecb",
    baseCurrency = "EUR",
    disableCache = false,
    clock = () => new Date(),
    providerOptions = {},
    currencyUrl,
    fetcher,
    url,
    baseUrl,
    appId,
  } = options;

  const base = baseCurrency ? String(baseCurrency).toUpperCase() : "EUR";
  const fetchOptions = {
    ...providerOptions,
  };

  if (currencyUrl) {
    fetchOptions.currencyUrl = currencyUrl;
  }
  if (fetcher) {
    fetchOptions.fetcher = fetcher;
  }
  if (url) {
    fetchOptions.url = url;
  }
  if (baseUrl) {
    fetchOptions.baseUrl = baseUrl;
  }
  if (appId) {
    fetchOptions.appId = appId;
  }

  let cachedSnapshot = null;
  let cacheKey = null;

  const ensureSnapshot = async () => {
    if (disableCache) {
      return harmoniseBase(
        await fetchCurrencies(provider, base, fetchOptions),
      );
    }

    const todayKey = clock().toISOString().split("T")[0];
    if (!cachedSnapshot || cacheKey !== todayKey) {
      cachedSnapshot = harmoniseBase(
        await fetchCurrencies(provider, base, fetchOptions),
      );
      cacheKey = todayKey;
    }
    return cachedSnapshot;
  };

  return async function getCurrencyRate(currencyCode) {
    const code = (currencyCode || base).toUpperCase();
    if (code === base) {
      return 1;
    }

    const snapshot = await ensureSnapshot();
    const rates = snapshot && snapshot.rates ? snapshot.rates : {};

    if (rates[code] === undefined) {
      throw new Error(`Currency rate for ${code} not available`);
    }

    return Number(rates[code]);
  };
}

function harmoniseBase(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return snapshot;
  }

  const declaredBase = snapshot.base ? snapshot.base.toUpperCase() : "EUR";
  if (declaredBase === "EUR") {
    return {
      ...snapshot,
      base: "EUR",
    };
  }

  const rates = snapshot.rates || {};
  const eurPerBase = Number(rates.EUR);
  if (!Number.isFinite(eurPerBase) || eurPerBase === 0) {
    throw new Error(
      `currency-rate-fetcher result missing EUR rate for base ${declaredBase}`,
    );
  }

  const converted = {};
  Object.entries(rates).forEach(([code, value]) => {
    if (!Number.isFinite(Number(value))) {
      return;
    }
    if (code.toUpperCase() === "EUR") {
      converted.EUR = 1;
      return;
    }
    converted[code.toUpperCase()] = Number(
      (Number(value) / eurPerBase).toFixed(12),
    );
  });

  converted[declaredBase] = Number((1 / eurPerBase).toFixed(12));
  converted.EUR = 1;

  return {
    ...snapshot,
    base: "EUR",
    rates: converted,
  };
}

module.exports = {
  createCurrencyRateProvider,
  fetchCurrencies,
  fetchCurrency,
};
