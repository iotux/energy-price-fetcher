const axios = require("axios");
const { format } = require("date-fns");

const DEFAULT_URL =
  "https://dataportal-api.nordpoolgroup.com/api/DayAheadPrices?market=DayAhead";

class NordPoolClient {
  constructor({ region, currency = "NOK", baseUrl = DEFAULT_URL }) {
    this.region = region;
    this.currency = currency;
    this.baseUrl = baseUrl;
  }

  async fetch(date) {
    const dateStr = typeof date === "string" ? date : format(date, "yyyy-MM-dd");
    const url = `${this.baseUrl}&deliveryArea=${this.region}&currency=${this.currency}&date=${dateStr}`;

    const response = await axios.get(url, {
      headers: {
        accept: "application/json",
        "Content-Type": "text/json",
      },
    });

    if (response.status !== 200 || !response.data) {
      throw new Error(
        `Nord Pool: Day ahead prices are not ready for ${dateStr}`,
      );
    }

    const points = (response.data.multiAreaEntries || [])
      .map((entry) => {
        const rawValue = entry.entryPerArea?.[this.region];
        if (rawValue === undefined) {
          return null;
        }
        return {
          start: entry.deliveryStart,
          end: entry.deliveryEnd,
          value: Number(rawValue) / 1000,
          currency: this.currency,
        };
      })
      .filter(Boolean);

    return {
      provider: "Nord Pool",
      providerUrl: url,
      resolution: points.length === 96 ? "PT15M" : "PT60M",
      points,
    };
  }
}

module.exports = NordPoolClient;
