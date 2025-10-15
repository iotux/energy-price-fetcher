#!/usr/bin/env node

const express = require("express");
const { fetchDayAheadPrices } = require("../src");

const app = express();
const port = process.env.PORT || 3000;

app.get("/api/prices", async (req, res) => {
  try {
    const region = req.query.region || "NO1";
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const interval = req.query.interval || "1h";
    const prefer = req.query.prefer || "nordpool";

    const prices = await fetchDayAheadPrices({
      region,
      date,
      interval,
      prefer,
      currency: req.query.currency || "NOK",
      entsoeToken: process.env.ENTSOE_TOKEN,
    });

    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Energy price API listening on http://localhost:${port}`);
});
